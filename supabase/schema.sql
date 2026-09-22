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

-- Email obveščanje lastnika (glej src/app/owner/notification-settings.tsx) -
-- 'daily' (dnevni povzetek, glej src/app/api/cron/daily-digest) in
-- 'per_booking' (email ob vsaki novi rezervaciji, glej
-- src/app/[slug]/actions.ts bookAppointment) sta na voljo SAMO za plan =
-- 'pro' - free lastnik lahko izbere samo 'off' (preverjeno tudi na strežniku
-- v updateNotificationPreference, ne samo v UI). "alter table add column if
-- not exists", ne "create table", ker salon_owners v produkciji že obstaja
-- (isti vzorec kot phone/whatsapp_consent/plan zgoraj).
alter table salon_owners add column if not exists notification_preference text
  not null default 'off'
  check (notification_preference in ('off', 'daily', 'per_booking'));

-- Zbrano na 4-koračnem registracijskem obrazcu (glej
-- src/app/owner/register/page.tsx + actions.ts) - vse nullable, ker so
-- vrstice, vstavljene PRED to migracijo, teh podatkov nimajo. Prikazano
-- lastniku ob odobritvi in v prihodnje za privzet nabor storitev glede na
-- category/subtype (glej DEFAULT_SERVICES v actions.ts - za zdaj še vedno
-- fiksen seznam, ne pogojen na category).
alter table salon_owners add column if not exists category text;
alter table salon_owners add column if not exists subtype text;
alter table salon_owners add column if not exists address text;
alter table salon_owners add column if not exists hours text;

-- hours je bil sprva prost tekst (glej "add column ... text" zgoraj), zdaj
-- pa je wizard prešel na po-dnevni urnik (glej SalonDayHours v
-- database.types.ts) - array objektov {day, closed, from, to}, zato mora
-- stolpec postati jsonb. "alter column type" NAMENOMA ne pade na starih
-- prostotekstovnih vrednostih (npr. "Pon-Pet 9-19"), ki niso veljaven JSON -
-- USING jih zavije v {"legacy_text": "..."} namesto da bi migracija padla
-- ali obstoječe podatke tiho izbrisala. Novi wizard take vrstice ne bere -
-- lastnik urnik samo ponovno vnese prek prihodnjega "uredi profil" UI-ja
-- (še ne obstaja).
alter table salon_owners alter column hours type jsonb using (
  case
    when hours is null or hours = '' then null
    else jsonb_build_object('legacy_text', hours)
  end
);

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
--
-- POZOR (2026-09): ta stolpec je bil v to datoteko dodan že prej, a je bil v
-- produkciji dejansko preverjen kot ŠE VEDNO manjkajoč (PostgREST vrne
-- "42703 column services.price does not exist" na živi bazi - glej git
-- log "Fix public booking page outage" in pogovor s Claude) - ne gre za
-- zastarel PostgREST schema cache. Ta vrstica MORA biti dejansko pognana v
-- Supabase SQL Editorju (ne samo obstajati tu v repozitoriju), po njej pa
-- za vsak slučaj poženi tudi `notify pgrst, 'reload schema';` spodaj, če se
-- napaka vseeno ponovi.
alter table services add column if not exists price numeric(6, 2) check (price is null or price >= 0);

-- Trajanje storitve v minutah - zbrano ob dodajanju/urejanju storitve (glej
-- src/app/owner/services/page.tsx) in privzeto nastavljeno na predlogah ob
-- registraciji (glej SERVICE_TEMPLATES v src/app/owner/register/actions.ts).
-- NULL = lastnik trajanja še ni nastavil. Trenutno SAMO shranjeno/prikazano
-- lastniku - javna rezervacijska stran (/[slug]) še vedno uporablja fiksno
-- urno mrežo (glej HOURS v src/lib/constants.ts), trajanje NE vpliva (še) na
-- dolžino/razmik prostih terminov.
alter table services add column if not exists duration_minutes int check (duration_minutes is null or duration_minutes > 0);

-- Neobvezna, prosto-besedilna skupina storitve (npr. "Nohti", "Pedikura") -
-- zbrana na /owner/services. NULL = lastnik kategorije ni nastavil - taka
-- storitev se na /[slug] prikaže v splošni skupini "Ostalo" na dnu (glej
-- groupServicesByCategory v [slug]/booking-page.tsx). Namenoma prosto
-- besedilo, ne fiksen seznam - vsak salon ima svoje smiselne skupine.
alter table services add column if not exists category text;

-- Če po zgornjih ALTER stavkih PostgREST še vedno vrača "column ... does not
-- exist" za stolpec, ki OČITNO obstaja (npr. viden v Table Editorju), gre za
-- zastarel schema cache, ne za manjkajočo migracijo - to ga prisili, da ga
-- takoj osveži (enakovredno gumbu "Reload schema" v Dashboard > API Settings).
notify pgrst, 'reload schema';

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

-- Trajanje TEGA KONKRETNEGA termina v minutah - POSNETEK trajanja izbrane
-- storitve v trenutku rezervacije (isti vzorec kot `service` zgoraj, ki je
-- prosto besedilo, ne živa FK na services.id) - če lastnik kasneje spremeni
-- trajanje storitve na /owner/services, že rezervirani termini ostanejo
-- nespremenjeni. Uporabljeno za izračun prostih terminov (glej
-- src/lib/availability.ts) - prilega se storitev v celoti med obstoječe
-- rezervacije in konec delovnika, ne samo "je ta točen čas prost".
alter table appointments add column if not exists duration_minutes int
  check (duration_minutes is null or duration_minutes > 0);

-- Obstoječi (že rezervirani) termini so bili vsi rezervirani pod prejšnjo,
-- implicitno urno mrežo (glej HOURS v src/lib/constants.ts) - zato 60 min
-- kot najbolj verjetna dejanska dolžina, da izračun prekrivanja zanje ne
-- pade na NULL (kar bi se obravnavalo kot "brez dolžine").
update appointments set duration_minutes = 60 where duration_minutes is null;

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
-- duration_minutes dodan, da lahko /[slug] izračuna PRAVO prekrivanje
-- (ne samo enak appointment_time) - glej src/lib/availability.ts.
create or replace view public_availability
  with (security_invoker = false) as
  select appointment_date, appointment_time, duration_minutes, status, salon_id
  from appointments
  where status <> 'cancelled';

grant select on public_availability to anon, authenticated;

-- Samo id/ime/slug/hours/category/address ODOBRENIH salonov - za razrešitev
-- /[slug] -> salon, prikaz imena na javni strani, izračun delovnega časa po
-- dnevih (glej src/lib/availability.ts resolveDayWindow) IN izbiro barvne
-- teme (category === "Kozmetični salon" -> spa, glej [slug]/page.tsx in
-- pogovor s Claude o data-theme="spa"). subtype OSTAJA neizpostavljen
-- (lastnikov interni registracijski podatek, ne za javnost). address je bil
-- prej tudi izločen, a ga stranka potrebuje za "Dodaj v koledar" gumbe na
-- potrditveni strani (lokacija dogodka) - glej booking-page.tsx.
create or replace view public_salons
  with (security_invoker = false) as
  select id, salon_name, slug, hours, category, address
  from salon_owners
  where status = 'approved';

grant select on public_salons to anon, authenticated;

-- Enako kot notify po services zgoraj - vrne PostgREST-ov schema cache po
-- ZGORNJIH ALTER/VIEW spremembah (novi stolpci/view-i so sicer dostopni šele
-- po naslednjem samodejnem osvežitvenem ciklu, ki lahko traja nekaj minut).
notify pgrst, 'reload schema';
