-- ═══════════════════════════════════════════════════════════════════════════
--  COPA PINGÜÍ DE BADALONA — esquema de la base de dades
--  Enganxa tot aquest fitxer a Supabase → SQL Editor → Run. Una sola vegada.
--
--  Les dates de la temporada i el mode de proves viuen a la taula `config`,
--  no al codi: es canvien des de la pestanya de coordinació.
--
--  Model: la classificació la pot mirar tothom. Per apuntar-hi banys cal
--  haver entrat amb Google o amb un enllaç per correu. Cadascú només toca
--  els seus. Ningú no ha de validar res: els banys compten de seguida.
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
  nota       text default '',
  -- L'esmorzar el reporta el mateix nedador en registrar el bany.
  esmorzar   boolean not null default false,
  -- 'aprovat' de sèrie. Els coordinadors poden passar-lo a 'anullat'
  -- si hi ha hagut un error: és l'única intervenció que els queda.
  estat      text not null default 'aprovat'
             check (estat in ('aprovat','anullat')),
  enviat     timestamptz not null default now(),
  -- Un mateix nedador no pot apuntar dues vegades la mateixa distància
  -- el mateix dia: gairebé sempre és un doble clic.
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
  id          integer primary key default 1 check (id = 1),
  inici       date not null default '2026-11-01',
  fi          date not null default '2027-03-31',
  pont_min    integer not null default 1400,
  pont_max    integer not null default 1600,
  -- true mentre proveu: l'app avisa amb una franja i deixa als coordinadors
  -- buidar tots els banys d'una tacada. Poseu-lo a false l'1 de novembre.
  mode_proves boolean not null default true,
  check (fi > inici)
);
insert into config (id) values (1) on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  QUI ETS
--
--  Dues funcions auxiliars. Van amb SECURITY DEFINER expressament: han de
--  poder mirar la taula `nedadors` sense passar per les seves pròpies
--  polítiques, que és el que provocaria una recursió infinita.
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

alter table nedadors  enable row level security;
alter table banys     enable row level security;
alter table dies      enable row level security;
alter table config    enable row level security;

-- Llegir: tothom, també sense haver entrat. La classificació és oberta.
drop policy if exists llegir_nedadors  on nedadors;
drop policy if exists llegir_banys     on banys;
drop policy if exists llegir_dies      on dies;
drop policy if exists llegir_config    on config;
create policy llegir_nedadors  on nedadors  for select using (true);
create policy llegir_banys     on banys     for select using (true);
create policy llegir_dies      on dies      for select using (true);
create policy llegir_config    on config    for select using (true);

-- Apuntar-se: un cop identificat, i una sola fitxa per persona.
-- El `user_id = auth.uid()` és el que impedeix crear fitxes en nom d'altri.
drop policy if exists apuntar_se on nedadors;
create policy apuntar_se on nedadors
  for insert to authenticated
  with check (user_id = auth.uid() and es_coordinador = false);

-- Canviar-se el nom. No es pot fer coordinador un mateix.
drop policy if exists editar_me on nedadors;
create policy editar_me on nedadors
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and es_coordinador = (select es_coordinador from nedadors n where n.user_id = auth.uid()));

-- Els banys: cadascú els seus, i sempre com a 'aprovat'.
drop policy if exists apuntar_bany   on banys;
drop policy if exists editar_bany    on banys;
drop policy if exists esborrar_bany  on banys;
create policy apuntar_bany on banys
  for insert to authenticated
  with check (nedador_id = jo_nedador() and estat = 'aprovat');
create policy editar_bany on banys
  for update to authenticated
  using (nedador_id = jo_nedador())
  with check (nedador_id = jo_nedador());
create policy esborrar_bany on banys
  for delete to authenticated
  using (nedador_id = jo_nedador());

-- Els coordinadors: temperatures, dies dobles, dates de la temporada, la
-- banda del pont, el mode de proves, i anul·lar un bany equivocat.
-- El reglament ja els donava l'última paraula.
drop policy if exists coord_nedadors  on nedadors;
drop policy if exists coord_banys     on banys;
drop policy if exists coord_dies      on dies;
drop policy if exists coord_config    on config;
create policy coord_nedadors  on nedadors  for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
create policy coord_banys     on banys     for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
create policy coord_dies      on dies      for all to authenticated using (soc_coordinador()) with check (soc_coordinador());
create policy coord_config    on config    for all to authenticated using (soc_coordinador()) with check (soc_coordinador());

-- ═══════════════════════════════════════════════════════════════════════════
--  ELS COORDINADORS
--
--  Entreu-hi tots dos un cop amb Google o amb l'enllaç per correu, poseu-vos
--  el nom, i després executeu això amb els vostres correus. És l'únic pas
--  que s'ha de fer a mà, i és a posta: si es pogués fer des de l'app, es
--  podria fer coordinador qualsevol.
-- ═══════════════════════════════════════════════════════════════════════════
-- update nedadors set es_coordinador = true
--  where user_id in (select id from auth.users
--                     where email in ('hugo@exemple.com','jordi@exemple.com'));
