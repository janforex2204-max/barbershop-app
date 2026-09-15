-- Shema za Fillio - multi-tenant rezervacijski sistem (vsak salon je ena
-- vrstica v salon_owners, vsi ostali podatki so nanj vezani prek salon_id).
-- Zaženi v Supabase Dashboard -> SQL Editor.

-- ---------------------------------------------------------------------------
-- LASTNIKI SALONA (registracija + ročna odobritev) - definirano najprej, ker
-- nanj kažejo salon_id stolpci spodaj.
-- ---------------------------------------------------------------------------
create table if not exists salon_owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  salon_name text not null,
  -- URL-varen identifikator za javno rezervacijsko stran /[slug] - edinstven
  -- čez celo platformo (glej src/lib/slug.ts za generiranje ob registraciji).
  slug text not null unique,
  -- Lastnikov telefon, zbran ob registraciji (glej /register) - trenutno se
  -- NE uporablja za same WhatsApp linke (ti gredo na STRANKINO številko, glej
  -- whatsAppLink() v src/lib/constants.ts), shranjen je za prihodnjo uporabo
  -- (npr. Twilio pošiljateljska identiteta, ločevanje WhatsApp Business linij
  -- med saloni, če to kdaj avtomatiziramo).
  phone text,
  -- Obvezno privoljenje ob registraciji, da se lastnikov telefon lahko
  -- uporabi za WhatsApp obveščanje strank (glej /register - checkbox).
  whatsapp_consent boolean not null default false,
  -- Naročniški nivo - "pro" odklene avtomatsko SMS obveščanje (glej
  -- src/app/owner/notifications-panel.tsx). Za zdaj se preklaplja ROČNO prek
  -- Table Editorja - pravega plačilnega sistema (Stripe ipd.) še ni.
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Naključen token za odobritev z enim klikom iz admin emaila (glej
  -- src/app/admin/approve/route.ts) - ni namenjen prijavi, samo temu.
  approval_token text unique,
  -- Kdaj je bil TRENUTNI approval_token izdan - ločeno od created_at
  -- (datum registracije), ker ga /admin/resend-approval osveži.
  approval_token_created_at timestamptz not null default now(),
  -- Ni null, ko je bil token že uporabljen (prepreči ponovno uporabo).
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists salon_owners_slug_idx on salon_owners (slug);

-- ---------------------------------------------------------------------------
-- STORITVE (services)
-- ---------------------------------------------------------------------------
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salon_owners(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists services_salon_idx on services (salon_id);

-- Cena storitve v EUR (do 9999.99, 2 decimalki - centi). "alter table add
-- column if not exists", ne "create table", ker services v produkciji
-- verjetno že obstaja (glej ip_address zgoraj za isti vzorec). NULL = lastnik
-- cene še ni nastavil - /[slug] in /owner to obravnavata enako kot 0 (brez
-- cene prikažeta samo ime storitve, glej src/lib/constants.ts formatPrice).
alter table services add column if not exists price numeric(6, 2) check (price is null or price >= 0);

-- ---------------------------------------------------------------------------
-- TERMINI (appointments)
-- ---------------------------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salon_owners(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  service text not null,
  appointment_date date not null,
  appointment_time text not null check (appointment_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'filled')),
  -- Priprava na več frizerjev znotraj enega salona (funkcionalnost še ne
  -- obstaja v UI).
  barber_name text not null default '',
  created_at timestamptz not null default now()
);

-- Prepreči dvojno rezervacijo istega termina PRI ISTEM SALONU (dva različna
-- salona lahko oba prosto uporabljata npr. 10:00 isti dan).
create unique index if not exists appointments_salon_date_time_active_idx
  on appointments (salon_id, appointment_date, appointment_time)
  where status <> 'cancelled';

create index if not exists appointments_salon_date_idx on appointments (salon_id, appointment_date);

-- IP odjemalca ob rezervaciji, SAMO za rate limiting (glej
-- src/lib/rate-limit.ts) - nikoli prikazano lastniku salona. "alter table
-- add column if not exists", ne "create table", ker appointments v produkciji
-- verjetno že obstaja.
alter table appointments add column if not exists ip_address inet;

-- Podpirata poizvedbi v src/lib/rate-limit.ts (štetje rezervacij po
-- telefonu/IP v zadnjem časovnem oknu) - namenoma GLOBALNA, čez vse salone,
-- zato brez salon_id.
create index if not exists appointments_phone_created_idx on appointments (customer_phone, created_at);
create index if not exists appointments_ip_created_idx on appointments (ip_address, created_at) where ip_address is not null;

-- ---------------------------------------------------------------------------
-- ČAKALNA VRSTA (waitlist)
-- ---------------------------------------------------------------------------
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salon_owners(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  preferred_date date not null,
  -- Katero storitev stranka čaka, ali 'vseeno' za katerokoli.
  service_preference text not null default 'vseeno',
  barber_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists waitlist_salon_date_idx on waitlist (salon_id, preferred_date);

-- IP odjemalca ob prijavi v čakalno vrsto, SAMO za rate limiting (glej
-- src/lib/rate-limit.ts) - nikoli prikazano lastniku salona.
alter table waitlist add column if not exists ip_address inet;

-- Podpirata poizvedbi v src/lib/rate-limit.ts (štetje vnosov po telefonu/IP v
-- zadnjem časovnem oknu) - namenoma GLOBALNA, čez vse salone, zato brez
-- salon_id.
create index if not exists waitlist_phone_created_idx on waitlist (customer_phone, created_at);
create index if not exists waitlist_ip_created_idx on waitlist (ip_address, created_at) where ip_address is not null;

-- ---------------------------------------------------------------------------
-- SMS OBVESTILA (log tega, kar bo kasneje pošiljal Twilio)
-- ---------------------------------------------------------------------------
create table if not exists sms_notifications (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salon_owners(id) on delete cascade,
  recipient_name text not null,
  recipient_phone text not null,
  message text not null,
  reason text not null check (reason in ('waitlist', 'earlier_slot')),
  appointment_id uuid references appointments(id) on delete set null,
  -- Kateri dan se obvestilo tiče (da ga nadzorna plošča lahko filtrira po
  -- izbranem dnevu v koledarju, enako kot termine in čakalno vrsto).
  appointment_date date,
  status text not null default 'pending' check (status in ('pending', 'sent', 'claimed', 'failed')),
  -- Razloči "sistem je samodejno poskusil poslati SMS" (Fillio Pro, glej
  -- cancelAppointment v src/app/owner/actions.ts) od "lastnik je ročno
  -- kliknil Pošlji WhatsApp" (markSmsSent) - oba primera pustita status
  -- 'sent'/'failed', ta stolpec pa nadzorni plošči pove, v kateri zavihek
  -- ("Ročno" ali "Avtomatsko") vrstica spada.
  auto_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sms_notifications_salon_date_idx on sms_notifications (salon_id, appointment_date);

-- ---------------------------------------------------------------------------
-- VARNOST (Row Level Security)
--
-- Lastnik salona se prijavi prek Supabase Auth (email + geslo) in ima poln
-- dostop SAMO do vrstic svojega lastnega salona (glej my_salon_id() spodaj -
-- to je meja izolacije med saloni). Stranke (anon) lahko:
--   - vidijo samo zasedenost in aktivne storitve KONKRETNEGA salona (prek
--     /[slug] strani, ki poizvedbe eksplicitno filtrira po salon_id),
--   - ustvarijo nov termin (booking) in se pridružijo čakalni vrsti.
-- ---------------------------------------------------------------------------
alter table services enable row level security;
alter table appointments enable row level security;
alter table waitlist enable row level security;
alter table sms_notifications enable row level security;
alter table salon_owners enable row level security;

-- salon_owners: vsak uporabnik lahko bere in vstavi SAMO svojo vrstico
-- (registracija + preverjanje lastnega statusa po prijavi). Odobritev
-- (sprememba status -> 'approved') se dela ročno prek Table Editorja s
-- postgres/service_role dostopom, ki RLS itak obide - zato tu ni potrebna
-- posebna "owner manage" politika.
drop policy if exists "salon_owners_self_select" on salon_owners;
create policy "salon_owners_self_select" on salon_owners
  for select using (auth.uid() = user_id);

drop policy if exists "salon_owners_self_insert" on salon_owners;
create policy "salon_owners_self_insert" on salon_owners
  for insert to authenticated with check (auth.uid() = user_id);

-- Meja izolacije med saloni: id SVOJEGA (odobrenega) salona, ali NULL, če
-- klicatelj ni odobren lastnik nobenega salona. "security definer" + fiksen
-- "search_path", da funkcija zanesljivo deluje ne glede na klicateljeve RLS
-- omejitve na salon_owners.
create or replace function my_salon_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from salon_owners where user_id = auth.uid() and status = 'approved' limit 1;
$$;

-- Vsak "create policy" ima pred sabo "drop policy if exists", da je celoten
-- skript varno ponovno zagnati (npr. če se popravi samo en del sheme).

-- services: vsi vidijo aktivne storitve (aplikacija SAMA filtrira po
-- salon_id iz URL-ja - glej /[slug]), lastnik ureja SAMO svoje.
drop policy if exists "services_public_read" on services;
create policy "services_public_read" on services
  for select using (active = true);

drop policy if exists "services_owner_manage" on services;
create policy "services_owner_manage" on services
  for all using (salon_id = my_salon_id()) with check (salon_id = my_salon_id());

-- appointments: anon lahko samo doda (rezervira), lastnik vidi/ureja SAMO
-- svoje. Anon NIMA select pravice na tabeli (imena/telefoni ostanejo
-- zasebni) - za prikaz prostih terminov strankam uporabi spodnji view.
drop policy if exists "appointments_owner_full_access" on appointments;
create policy "appointments_owner_full_access" on appointments
  for all using (salon_id = my_salon_id()) with check (salon_id = my_salon_id());

drop policy if exists "appointments_anon_insert" on appointments;
create policy "appointments_anon_insert" on appointments
  for insert to anon with check (status = 'booked');

-- waitlist: anon lahko samo doda, lastnik vidi/ureja SAMO svoje.
drop policy if exists "waitlist_owner_full_access" on waitlist;
create policy "waitlist_owner_full_access" on waitlist
  for all using (salon_id = my_salon_id()) with check (salon_id = my_salon_id());

drop policy if exists "waitlist_anon_insert" on waitlist;
create policy "waitlist_anon_insert" on waitlist
  for insert to anon with check (true);

-- sms_notifications: samo lastnik SAMEGA SEBE (anon nima nobenega dostopa).
drop policy if exists "sms_notifications_owner_full_access" on sms_notifications;
create policy "sms_notifications_owner_full_access" on sms_notifications
  for all using (salon_id = my_salon_id()) with check (salon_id = my_salon_id());

-- ---------------------------------------------------------------------------
-- JAVNI VIEW-I - brez osebnih/administrativnih podatkov, ki jih smejo brati
-- stranke na /[slug]. security_invoker = false: view teče s pravicami
-- lastnika (ne klicatelja), zato ga anon lahko bere kljub temu, da nima
-- SELECT pravice neposredno na appointments/salon_owners.
-- ---------------------------------------------------------------------------
create or replace view public_availability
  with (security_invoker = false) as
  select appointment_date, appointment_time, status, salon_id
  from appointments
  where status <> 'cancelled';

grant select on public_availability to anon, authenticated;

-- Samo id/ime/slug ODOBRENIH salonov - za razrešitev /[slug] -> salon in
-- prikaz imena na javni strani. NIKOLI ne izpostavi approval_token/user_id.
create or replace view public_salons
  with (security_invoker = false) as
  select id, salon_name, slug
  from salon_owners
  where status = 'approved';

grant select on public_salons to anon, authenticated;
