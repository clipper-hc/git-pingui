-- ═══════════════════════════════════════════════════════════════════════════
--  COPA PINGÜÍ — canvis de l'1 de novembre de 2026
--  Executa'l sencer a Supabase → SQL Editor. No esborra cap dada.
--  Inclou també els canvis del 28/10 per si no els havies passat.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Del 28 d'octubre, per si de cas ───────────────────────────────────────
alter table banys  add column if not exists fora boolean not null default false;
alter table config add column if not exists temp_base integer not null default 23;
alter table config add column if not exists punts_extrem integer not null default 15;
alter table config add column if not exists esmorzars_mes integer not null default 2;
alter table config add column if not exists max_fora_mes integer not null default 1;
alter table config add column if not exists inscripcio_euros integer not null default 20;

-- ── 1. Un pont són uns 1700 m, no 1500 ────────────────────────────────────
update config set pont_min = 1600, pont_max = 1800 where id = 1;

-- ── 2. Modificadors: bonificacions que el nedador marca en registrar ──────
--  Hi pots anar afegint files durant la temporada des del Table Editor i
--  apareixen soles al formulari. Són punts PLANS: no es multipliquen pel
--  coeficient de distància ni es dupliquen els dies dobles.
create table if not exists modificadors (
  id     uuid primary key default gen_random_uuid(),
  nom    text not null check (length(trim(nom)) between 2 and 60),
  punts  numeric(5,1) not null default 1,
  actiu  boolean not null default true,
  ordre  integer not null default 100,
  creat  timestamptz not null default now()
);

alter table banys add column if not exists modificadors jsonb not null default '[]'::jsonb;

alter table modificadors enable row level security;
drop policy if exists llegir_modificadors on modificadors;
drop policy if exists coord_modificadors  on modificadors;
create policy llegir_modificadors on modificadors for select using (true);
create policy coord_modificadors  on modificadors for all to authenticated
  using (soc_coordinador()) with check (soc_coordinador());

-- Els tres que vas dir. Afegeix-ne més quan vulguis: n'hi ha prou amb una
-- fila nova, i surt al formulari de tothom sense tocar codi.
insert into modificadors (nom, punts, ordre) values
  ('He vist un tauró',      10, 10),
  ('He vist un dofí',       10, 20),
  ('M''ha picat una medusa', 1, 30)
on conflict do nothing;

-- ── Comprovació ───────────────────────────────────────────────────────────
select pont_min, pont_max, temp_base, esmorzars_mes, max_fora_mes from config where id = 1;
select nom, punts, actiu from modificadors order by ordre;
