-- ═══════════════════════════════════════════════════════════════════════════
--  COPA PINGÜÍ DE BADALONA — esquema complet
--  Per a una instal·lació NOVA. Si ja tens la base de dades en marxa,
--  executa `migracio.sql` i no aquest fitxer.
--
--  La classificació la pot mirar tothom. Per apuntar-hi banys cal haver
--  entrat amb Google o amb un enllaç per correu. Cadascú només toca els
--  seus. Ningú no ha de validar res: els banys compten de seguida.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists nedadors (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete cascade,
  nom            text not null check (length(trim(nom)) between 2 and 40),
  correu         text,
  es_coordinador boolean not null default false,
  creat          timestamptz not null default now()
);

create table if not exists banys (
  id         uuid primary key default gen_random_uuid(),
  nedador_id uuid not null references nedadors(id) on delete cascade,
  data       date not null,
  metres     integer not null check (metres between 100 and 20000),
  neopre     boolean not null default false,
  competitiu boolean not null default false,
  -- L'esmorzar el reporta el mateix nedador en registrar el bany.
  esmorzar   boolean not null default false,
  -- Bany fora de Badalona. Només en compta un cada mes, i la temperatura
  -- que se li aplica és sempre la de Badalona d'aquell dia.
  fora       boolean not null default false,
  nota       text default '',
  -- Bonificacions marcades pel nedador: llista d'ids de `modificadors`.
  modificadors jsonb not null default '[]'::jsonb,
  estat      text not null default 'aprovat'
             check (estat in ('aprovat','anullat')),
  enviat     timestamptz not null default now(),
  unique (nedador_id, data, metres)
);
create index if not exists banys_data_idx on banys (data);

create table if not exists dies (
  data   date primary key,
  temp_c numeric(4,1),
  doble  boolean not null default false,
  font   text default 'manual'          -- 'manual' o 'aemet'
);

-- Tot el que es pot parametritzar sense tocar codi viu aquí.
create table if not exists config (
  id               integer primary key default 1 check (id = 1),
  inici            date not null default '2026-11-01',
  fi               date not null default '2027-03-31',
  pont_min         integer not null default 1600,
  pont_max         integer not null default 1800,
  -- Temperatura a partir de la qual no es puntua. El reglament deia 20 ºC;
  -- amb l'aigua que fa ara, el novembre no puntuaria gairebé mai.
  temp_base        integer not null default 23,
  punts_extrem     integer not null default 15,
  -- Esmorzars exigits CADA MES de la temporada.
  esmorzars_mes    integer not null default 2,
  -- Banys fora de Badalona que compten cada mes.
  max_fora_mes     integer not null default 1,
  inscripcio_euros integer not null default 20,
  mode_proves      boolean not null default true,
  check (fi > inici)
);
insert into config (id) values (1) on conflict do nothing;

-- Bonificacions configurables: els coordinadors hi afegeixen files durant
-- la temporada i apareixen soles al formulari de registre.
create table if not exists modificadors (
  id     uuid primary key default gen_random_uuid(),
  nom    text not null check (length(trim(nom)) between 2 and 60),
  punts  numeric(5,1) not null default 1,
  actiu  boolean not null default true,
  ordre  integer not null default 100,
  creat  timestamptz not null default now()
);
insert into modificadors (nom, punts, ordre) values
  ('He vist un tauró',      10, 10),
  ('He vist un dofí',       10, 20),
  ('M''ha picat una medusa', 1, 30)
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  QUI ETS
--  SECURITY DEFINER expressament: han de poder mirar `nedadors` sense passar
--  per les seves pròpies polítiques, que provocaria una recursió infinita.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function jo_nedador()
returns uuid language sql stable security definer set search_path = public as $$
  select id from nedadors where user_id = auth.uid()
$$;

create or replace function soc_coordinador()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_coordinador from nedadors where user_id = auth.uid()), false)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  PERMISOS
-- ═══════════════════════════════════════════════════════════════════════════

alter table nedadors enable row level security;
alter table banys    enable row level security;
alter table dies     enable row level security;
alter table config   enable row level security;
alter table modificadors enable row level security;

drop policy if exists llegir_nedadors on nedadors;
drop policy if exists llegir_banys    on banys;
drop policy if exists llegir_dies     on dies;
drop policy if exists llegir_config   on config;
create policy llegir_nedadors on nedadors for select using (true);
create policy llegir_banys    on banys    for select using (true);
create policy llegir_dies     on dies     for select using (true);
create policy llegir_config   on config   for select using (true);
drop policy if exists llegir_modificadors on modificadors;
create policy llegir_modificadors on modificadors for select using (true);

drop policy if exists apuntar_se on nedadors;
create policy apuntar_se on nedadors
  for insert to authenticated
  with check (user_id = auth.uid() and es_coordinador = false);

drop policy if exists editar_me on nedadors;
create policy editar_me on nedadors
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and es_coordinador = (select es_coordinador from nedadors n where n.user_id = auth.uid()));

drop policy if exists apuntar_bany  on banys;
drop policy if exists editar_bany   on banys;
drop policy if exists esborrar_bany on banys;
create policy apuntar_bany on banys
  for insert to authenticated
  with check (nedador_id = jo_nedador() and estat = 'aprovat');
create policy editar_bany on banys
  for update to authenticated
  using (nedador_id = jo_nedador()) with check (nedador_id = jo_nedador());
create policy esborrar_bany on banys
  for delete to authenticated using (nedador_id = jo_nedador());

drop policy if exists coord_nedadors on nedadors;
drop policy if exists coord_banys    on banys;
drop policy if exists coord_dies     on dies;
drop policy if exists coord_config   on config;
create policy coord_nedadors on nedadors for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
create policy coord_banys    on banys    for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
create policy coord_dies     on dies     for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
create policy coord_config   on config   for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
drop policy if exists coord_modificadors on modificadors;
create policy coord_modificadors on modificadors for all to authenticated using (soc_coordinador()) with check (soc_coordinador());

-- ═══════════════════════════════════════════════════════════════════════════
--  ELS COORDINADORS
--  Entreu-hi tots dos un cop, poseu-vos el nom, i després executeu això.
--  És l'únic pas manual, i és a posta.
-- ═══════════════════════════════════════════════════════════════════════════
-- update nedadors set es_coordinador = true
--  where user_id in (select id from auth.users
--                     where email in ('hugo@exemple.com','jordi@exemple.com'));
