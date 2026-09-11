-- Osnovna shema za rezervacijski sistem frizerskega salona.
-- Zaženi v Supabase Dashboard -> SQL Editor (ali prek `supabase db push`, glej README korake v chatu).

-- ---------------------------------------------------------------------------
-- STORITVE (services)
-- ---------------------------------------------------------------------------
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into services (name, sort_order) values
  ('Strizenje', 1),
  ('Brada', 2),
  ('Strizenje + Brada', 3),
  ('Otroško striženje', 4)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- TERMINI (appointments)
-- ---------------------------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  service text not null,
  appointment_date date not null,
  appointment_time text not null check (appointment_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'filled')),
  -- Priprava na več frizerjev (funkcionalnost še ne obstaja v UI) - privzeto lastnik.
  barber_name text not null default 'Žiga Kljun',
  created_at timestamptz not null default now()
);

-- Prepreči dvojno rezervacijo istega termina (razen če je prejšnji odpovedan).
create unique index if not exists appointments_date_time_active_idx
  on appointments (appointment_date, appointment_time)
  where status <> 'cancelled';

create index if not exists appointments_date_idx on appointments (appointment_date);

-- ---------------------------------------------------------------------------
-- ČAKALNA VRSTA (waitlist)
-- ---------------------------------------------------------------------------
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  preferred_date date not null,
  -- Katero storitev stranka čaka, ali 'vseeno' za katerokoli.
  service_preference text not null default 'vseeno',
  -- Priprava na več frizerjev (funkcionalnost še ne obstaja v UI) - privzeto lastnik.
  barber_name text not null default 'Žiga Kljun',
  created_at timestamptz not null default now()
);

create index if not exists waitlist_date_idx on waitlist (preferred_date);

-- ---------------------------------------------------------------------------
-- SMS OBVESTILA (log tega, kar bo kasneje pošiljal Twilio)
-- ---------------------------------------------------------------------------
create table if not exists sms_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  recipient_phone text not null,
  message text not null,
  reason text not null check (reason in ('waitlist', 'earlier_slot')),
  appointment_id uuid references appointments(id) on delete set null,
  -- Kateri dan se obvestilo tiče (da ga nadzorna plošča lahko filtrira po
  -- izbranem dnevu v koledarju, enako kot termine in čakalno vrsto).
  appointment_date date,
  status text not null default 'pending' check (status in ('pending', 'sent', 'claimed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists sms_notifications_date_idx on sms_notifications (appointment_date);

-- ---------------------------------------------------------------------------
-- VARNOST (Row Level Security)
--
-- Lastnik salona se prijavi prek Supabase Auth (email + geslo) in ima poln
-- dostop (authenticated). Stranke (anon) lahko:
--   - vidijo samo zasedenost (datum/ura/status) prek javnega view-a spodaj,
--     NE pa imen/telefonov drugih strank,
--   - ustvarijo nov termin (booking) in se pridružijo čakalni vrsti.
-- ---------------------------------------------------------------------------
alter table services enable row level security;
alter table appointments enable row level security;
alter table waitlist enable row level security;
alter table sms_notifications enable row level security;

-- Vsak "create policy" ima pred sabo "drop policy if exists", da je celoten
-- skript varno ponovno zagnati (npr. če se popravi samo en del sheme).

-- services: vsi vidijo aktivne storitve, ureja jih samo lastnik
drop policy if exists "services_public_read" on services;
create policy "services_public_read" on services
  for select using (active = true);

drop policy if exists "services_owner_manage" on services;
create policy "services_owner_manage" on services
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- appointments: anon lahko samo doda (rezervira), lastnik vidi/ureja vse.
-- Anon NIMA select pravice na tabeli (imena/telefoni ostanejo zasebni) -
-- za prikaz prostih terminov strankam uporabi spodnji view `public_availability`.
drop policy if exists "appointments_owner_full_access" on appointments;
create policy "appointments_owner_full_access" on appointments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "appointments_anon_insert" on appointments;
create policy "appointments_anon_insert" on appointments
  for insert to anon with check (status = 'booked');

-- waitlist: anon lahko samo doda, lastnik vidi/ureja vse.
drop policy if exists "waitlist_owner_full_access" on waitlist;
create policy "waitlist_owner_full_access" on waitlist
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "waitlist_anon_insert" on waitlist;
create policy "waitlist_anon_insert" on waitlist
  for insert to anon with check (true);

-- sms_notifications: samo lastnik (anon nima nobenega dostopa).
drop policy if exists "sms_notifications_owner_full_access" on sms_notifications;
create policy "sms_notifications_owner_full_access" on sms_notifications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- JAVNA ZASEDENOST - view brez osebnih podatkov, ki ga smejo brati stranke.
-- ---------------------------------------------------------------------------
-- security_invoker = false (privzeto): view teče s pravicami lastnika (ne
-- klicatelja), zato ga anon lahko bere kljub temu, da nima SELECT pravice
-- neposredno na appointments. Varno je, ker view izpostavi samo datum/uro/status.
create or replace view public_availability
  with (security_invoker = false) as
  select appointment_date, appointment_time, status
  from appointments
  where status <> 'cancelled';

grant select on public_availability to anon, authenticated;
