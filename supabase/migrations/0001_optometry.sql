-- optometry-for-claude-code: core schema.
-- An independent optometry practice's operating record the way Optomate
-- sells it: the optometrists and their hours, the patient book, the
-- appointment book, eye examinations with the Medicare item each one bills,
-- spectacle and contact lens prescriptions with their expiry dates, frame
-- and contact lens stock, spectacle jobs from order to the lab to
-- collection, invoices and payments, claims to Medicare, DVA and the health
-- funds from ready to paid, and recalls.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
-- Money is in cents, AUD by default. GST and payroll stay in accounting,
-- deliberately.
--
-- Deliberately NOT here: payment processing, online booking pages, SMS
-- sending, the claiming channels themselves (Medicare Online, DVA, HICAPS),
-- equipment integrations and ePrescribing. Recalls and reminders draft to
-- drafts/ and a person sends them.
--
-- The sharp edges are deliberate:
--   * a comprehensive Medicare item is checked before it is billed: 10910
--     only for a patient under 65 with no comprehensive item in 36 months,
--     10911 only for 65 and over with none in 12 months, 10913 and 10914
--     only with the clinical reason written down, 10915 only for a patient
--     with diabetes whose eyes were dilated (MBS Online, optometry items)
--   * an examination is recorded for every completed consult, and once
--     finalised it is never edited: corrections are addenda
--   * a claim never lodges for an examination that is not finalised
--   * a DVA consult never carries a gap to the veteran
--   * every prescription carries an issue date and an expiry date, and a
--     patient can have a copy of it, marked EXPIRED if it has (Optometry
--     Board of Australia, Guidelines: prescription of optical appliances)
--   * a spectacle job never orders against an expired or superseded
--     prescription, and contact lenses never sell without a current
--     contact lens prescription
--   * stock never goes below zero, and a payment never exceeds a balance
--   * nobody is double-booked, and nothing is booked outside an
--     optometrist's recorded working hours
--   * recall drafts about an eye examination that is clinically due go to
--     everyone with a way to reach them; win-back and marketing drafts only
--     ever address patients who opted in (Spam Act 2003 (Cth); Unsolicited
--     Electronic Messages Act 2007 (NZ))
--   * no deleting records: appointments cancel with a reason, patients
--     archive, jobs cancel, the clinical record stays

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Settings ------------------------------------------------------------------------
-- The handful of numbers the rules and views read. Change them with
-- `settings set`.

create table if not exists settings (
  key         text primary key,
  value       text not null,
  note        text,
  updated_at  timestamptz not null default now()
);

insert into settings (key, value, note) values
  ('practice_name',           'Your Practice', 'Printed on documents and drafts'),
  ('currency',                'AUD',  'Money is stored in cents of this currency'),
  ('exam_due_days',           '2',    'Days after a consult before an unfinalised examination is overdue'),
  ('spectacle_rx_months',     '24',   'Default expiry of a spectacle prescription (the Board guideline names two years as the common period)'),
  ('contact_lens_rx_months',  '12',   'Default expiry of a contact lens prescription (Optometry Australia names one year as the norm)'),
  ('rx_warn_days',            '45',   'Days before expiry that a prescription is raised'),
  ('job_ready_warn_days',     '14',   'Days a finished job can wait for collection before it is raised'),
  ('claim_query_days',        '21',   'Days a lodged claim can go unpaid before it is queried'),
  ('recall_horizon_days',     '14',   'How far ahead the attention list looks for recalls falling due'),
  ('recall_max_contacts',     '3',    'Contacts before an unanswered recall is closed as lapsed'),
  ('collect_requires_payment','true', 'A job is not handed over while its invoice has a balance')
on conflict (key) do nothing;

-- The team ------------------------------------------------------------------------

create table if not exists optometrists (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  provider_number  text,            -- Medicare provider number for this location
  registration_no  text,            -- Ahpra OPT number (AU) or OCANZ / ODOB (NZ)
  therapeutic      boolean not null default false,  -- endorsed for scheduled medicines
  days             text not null default 'mon,tue,wed,thu,fri',
  starts_at        time not null default '09:00',
  ends_at          time not null default '17:30',
  status           text not null default 'active' check (status in ('active', 'former')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists optometrists_updated on optometrists;
create trigger optometrists_updated before update on optometrists for each row execute function set_updated_at();

-- Patients ------------------------------------------------------------------------

create table if not exists patients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  date_of_birth     date,
  phone             text,
  email             text,
  address           text,
  medicare_number   text,
  health_fund       text,            -- the fund name; the member number sits beside it
  health_fund_no    text,
  dva_number        text,            -- a DVA card holder: no gap, ever
  diabetic          boolean not null default false,
  conditions        text,            -- glaucoma suspect, keratoconus, AMD: the clinical flags
  marketing_opt_in  boolean,         -- null = never asked
  status            text not null default 'active' check (status in ('active', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists patients_name on patients (lower(name));
drop trigger if exists patients_updated on patients;
create trigger patients_updated before update on patients for each row execute function set_updated_at();

create table if not exists patient_notes (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Services: what goes in the appointment book, with its fee and Medicare item.

create table if not exists services (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  kind       text not null default 'consult' check (kind in ('consult', 'contact_lens', 'dispense', 'other')),
  minutes    int not null default 30 check (minutes > 0),
  fee_cents  int not null default 0 check (fee_cents >= 0),
  mbs_item   text,              -- the default item; the exam can change it
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists services_updated on services;
create trigger services_updated before update on services for each row execute function set_updated_at();

-- The appointment book --------------------------------------------------------------

create table if not exists appointments (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,        -- APT-1001
  patient_id     uuid not null references patients(id),
  optometrist_id uuid references optometrists(id),  -- null for a dispensing appointment
  service_id     uuid not null references services(id),
  on_date        date not null,
  starts_at      time not null,
  ends_at        time not null,
  status         text not null default 'booked'
                 check (status in ('booked', 'confirmed', 'completed', 'cancelled', 'dna')),
  reason         text,
  cancel_reason  text,
  imported       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_day on appointments (on_date, optometrist_id);
drop trigger if exists appointments_updated on appointments;
create trigger appointments_updated before update on appointments for each row execute function set_updated_at();

-- Examinations: the clinical record of a consult, and the item it bills.

create table if not exists exams (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,       -- EXM-501
  appointment_id  uuid unique references appointments(id),
  patient_id      uuid not null references patients(id),
  optometrist_id  uuid not null references optometrists(id),
  on_date         date not null,
  mbs_item        text,                        -- 10910, 10911, 10913, 10914, 10915, 10916, 10918 ... or null (private)
  billing         text not null default 'bulk' check (billing in ('bulk', 'private', 'dva', 'fund', 'none')),
  item_reason     text,                        -- required for 10913 and 10914
  dilated         boolean not null default false,
  va_right        text,
  va_left         text,
  iop_right       numeric(4,1),
  iop_left        numeric(4,1),
  history         text,
  findings        text,
  management      text,
  recall_months   int,
  recall_kind     text,
  status          text not null default 'draft' check (status in ('draft', 'final')),
  finalised_at    timestamptz,
  imported        boolean not null default false,  -- a past consult carried across so the Medicare clock is right
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists exams_patient on exams (patient_id, on_date);
drop trigger if exists exams_updated on exams;
create trigger exams_updated before update on exams for each row execute function set_updated_at();

-- A finalised examination never changes. The database enforces it too.
create or replace function exams_lock_final() returns trigger
language plpgsql as $$
begin
  if old.status = 'final' then
    raise exception 'Examination % is finalised and cannot be edited. Add an addendum.', old.ref;
  end if;
  return new;
end
$$;
drop trigger if exists exams_lock on exams;
create trigger exams_lock before update on exams for each row execute function exams_lock_final();

create table if not exists exam_addenda (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references exams(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Prescriptions --------------------------------------------------------------------

create table if not exists prescriptions (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,        -- RX-701
  patient_id      uuid not null references patients(id),
  exam_id         uuid references exams(id),
  optometrist_id  uuid references optometrists(id),
  kind            text not null check (kind in ('spectacle', 'contact_lens')),
  issued_on       date not null,
  expires_on      date not null,
  r_sph numeric(5,2), r_cyl numeric(5,2), r_axis int, r_add numeric(4,2),
  l_sph numeric(5,2), l_cyl numeric(5,2), l_axis int, l_add numeric(4,2),
  pd              text,
  lens            text,               -- contact lens: brand, base curve, diameter, modality
  notes           text,
  status          text not null default 'active' check (status in ('active', 'superseded')),
  released_on     date,               -- a copy handed to the patient
  imported        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (expires_on > issued_on)
);
create index if not exists prescriptions_patient on prescriptions (patient_id, kind, issued_on);
drop trigger if exists prescriptions_updated on prescriptions;
create trigger prescriptions_updated before update on prescriptions for each row execute function set_updated_at();

-- Stock: frames, contact lenses, solutions, accessories ----------------------------

create table if not exists stock (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  kind          text not null check (kind in ('frame', 'contact_lens', 'solution', 'accessory')),
  brand         text not null,
  name          text not null,
  colour        text,
  size          text,
  cost_cents    int not null default 0 check (cost_cents >= 0),
  retail_cents  int not null default 0 check (retail_cents >= 0),
  on_hand       int not null default 0 check (on_hand >= 0),
  reorder_at    int not null default 0,
  received_on   date,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists stock_updated on stock;
create trigger stock_updated before update on stock for each row execute function set_updated_at();

-- Invoices and payments -------------------------------------------------------------

create table if not exists invoices (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null unique,          -- INV-2001
  patient_id  uuid not null references patients(id),
  payer       text not null default 'patient' check (payer in ('patient', 'medicare', 'dva', 'fund')),
  issued_on   date not null default current_date,
  due_on      date not null default current_date,
  status      text not null default 'sent' check (status in ('sent', 'paid', 'void')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists invoices_updated on invoices;
create trigger invoices_updated before update on invoices for each row execute function set_updated_at();

create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id),
  description text not null,
  qty         int not null default 1 check (qty > 0),
  unit_cents  int not null check (unit_cents >= 0),
  mbs_item    text,
  stock_id    uuid references stock(id),
  created_at  timestamptz not null default now()
);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id),
  amount_cents  int not null check (amount_cents > 0),
  method        text not null default 'eftpos',
  paid_on       date not null default current_date,
  created_at    timestamptz not null default now()
);

-- Spectacle jobs: from the order to the lab to the patient's hands -------------------

create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,        -- JOB-3001
  patient_id    uuid not null references patients(id),
  rx_id         uuid not null references prescriptions(id),
  frame_id      uuid references stock(id),   -- null when the patient brings their own frame
  frame_desc    text,
  lens_desc     text not null,
  lab           text not null,
  dispenser     text,
  status        text not null default 'ordered'
                check (status in ('ordered', 'received', 'ready', 'collected', 'remake', 'cancelled')),
  ordered_on    date not null default current_date,
  promised_on   date,                        -- what the lab promised
  received_on   date,
  notified_on   date,                        -- the patient told it is ready
  collected_on  date,
  remake_reason text,
  price_cents   int not null default 0,
  invoice_id    uuid references invoices(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists jobs_updated on jobs;
create trigger jobs_updated before update on jobs for each row execute function set_updated_at();

-- Claims to Medicare, DVA and the health funds --------------------------------------

create table if not exists claims (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,        -- CLM-4001
  funder        text not null check (funder in ('medicare', 'dva', 'fund')),
  fund_name     text,
  patient_id    uuid not null references patients(id),
  exam_id       uuid references exams(id),
  job_id        uuid references jobs(id),
  invoice_id    uuid references invoices(id),
  item          text not null,               -- MBS item, DVA item, or the fund's item code
  amount_cents  int not null check (amount_cents >= 0),
  service_on    date not null,
  status        text not null default 'ready' check (status in ('ready', 'lodged', 'paid', 'rejected')),
  lodged_on     date,
  paid_on       date,
  paid_cents    int,
  reject_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists claims_updated on claims;
create trigger claims_updated before update on claims for each row execute function set_updated_at();

-- Recalls ---------------------------------------------------------------------------

create table if not exists recalls (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references patients(id),
  kind              text not null default 'eye examination',
  due_on            date not null,
  status            text not null default 'open' check (status in ('open', 'booked', 'done', 'lapsed', 'cancelled')),
  contacts          int not null default 0,
  last_contacted_on date,
  exam_id           uuid references exams(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists recalls_updated on recalls;
create trigger recalls_updated before update on recalls for each row execute function set_updated_at();

-- ===================================================================================
-- Views: what the commands and the dashboards read.

create or replace view v_invoices as
select i.id, i.ref, i.patient_id, p.name as patient, i.payer, i.issued_on, i.due_on, i.status,
       coalesce(t.total_cents, 0) as total_cents,
       coalesce(pa.paid_cents, 0) as paid_cents,
       coalesce(t.total_cents, 0) - coalesce(pa.paid_cents, 0) as balance_cents,
       greatest(0, current_date - i.due_on) as days_overdue
from invoices i
join patients p on p.id = i.patient_id
left join (select invoice_id, sum(qty * unit_cents) as total_cents from invoice_items group by invoice_id) t on t.invoice_id = i.id
left join (select invoice_id, sum(amount_cents) as paid_cents from payments group by invoice_id) pa on pa.invoice_id = i.id;

create or replace view v_appointments as
select a.id, a.ref, a.patient_id, p.name as patient, p.phone, a.optometrist_id, o.name as optometrist,
       s.code as service_code, s.name as service, s.kind as service_kind, s.fee_cents, s.mbs_item,
       a.on_date, a.starts_at, a.ends_at, a.status, a.reason, a.cancel_reason, a.imported,
       p.dva_number is not null as dva, p.diabetic
from appointments a
join patients p on p.id = a.patient_id
join services s on s.id = a.service_id
left join optometrists o on o.id = a.optometrist_id;

-- The comprehensive items that start the 36 and 12 month clocks.
create or replace view v_comprehensive as
select e.patient_id, e.on_date, e.mbs_item, e.ref
from exams e
where e.mbs_item in ('10905', '10907', '10910', '10911', '10913', '10914', '10915');

create or replace view v_patients as
with last_exam as (
  select patient_id, max(on_date) as last_exam_on from exams group by patient_id
),
last_comp as (
  select distinct on (patient_id) patient_id, on_date as last_comprehensive_on, mbs_item as last_comprehensive_item
  from v_comprehensive order by patient_id, on_date desc
),
next_appt as (
  select patient_id, min(on_date) as next_appt_on
  from appointments where status in ('booked', 'confirmed') and on_date >= current_date group by patient_id
),
spend as (
  select i.patient_id, sum(ii.qty * ii.unit_cents) as spend_cents_24m
  from invoices i join invoice_items ii on ii.invoice_id = i.id
  where i.status <> 'void' and i.issued_on > current_date - 730
  group by i.patient_id
),
bal as (
  select patient_id, sum(balance_cents) as balance_cents from v_invoices
  where status = 'sent' and payer = 'patient' group by patient_id
)
select p.id as patient_id, p.name, p.date_of_birth, p.phone, p.email, p.medicare_number,
       p.health_fund, p.health_fund_no, p.dva_number, p.diabetic, p.conditions,
       p.marketing_opt_in, p.status,
       case when p.date_of_birth is null then null
            else extract(year from age(current_date, p.date_of_birth))::int end as age,
       le.last_exam_on, (current_date - le.last_exam_on) as days_since_exam,
       lc.last_comprehensive_on, lc.last_comprehensive_item,
       na.next_appt_on,
       coalesce(s.spend_cents_24m, 0) as spend_cents_24m,
       coalesce(b.balance_cents, 0) as balance_cents
from patients p
left join last_exam le on le.patient_id = p.id
left join last_comp lc on lc.patient_id = p.id
left join next_appt na on na.patient_id = p.id
left join spend s on s.patient_id = p.id
left join bal b on b.patient_id = p.id;

-- When each patient can next have a comprehensive consult billed to Medicare.
create or replace view v_medicare_eligibility as
select v.patient_id, v.name, v.age, v.last_comprehensive_on, v.last_comprehensive_item,
       case when v.age is null then null when v.age >= 65 then '10911' else '10910' end as routine_item,
       case when v.last_comprehensive_on is null then null
            when v.age >= 65 then (v.last_comprehensive_on + interval '12 months')::date
            else (v.last_comprehensive_on + interval '36 months')::date end as eligible_from
from v_patients v
where v.status = 'active';

-- Completed consults whose examination is missing or still in draft.
create or replace view v_exams_due as
select a.id as appointment_id, a.ref, a.patient_id, a.patient, a.optometrist, a.service, a.on_date,
       (current_date - a.on_date) as days_since,
       e.ref as exam_ref,
       case when e.id is null then 'missing' else e.status end as exam_state
from v_appointments a
left join exams e on e.appointment_id = a.id
where a.status = 'completed' and a.service_kind in ('consult', 'contact_lens') and not a.imported
  and (e.id is null or e.status <> 'final');

create or replace view v_prescriptions as
select r.id, r.ref, r.patient_id, p.name as patient, p.phone, p.marketing_opt_in, r.kind, r.issued_on, r.expires_on,
       (r.expires_on - current_date) as days_to_expiry,
       r.expires_on < current_date as expired,
       r.r_sph, r.r_cyl, r.r_axis, r.r_add, r.l_sph, r.l_cyl, r.l_axis, r.l_add, r.pd, r.lens, r.notes,
       r.status, r.released_on, o.name as optometrist, e.ref as exam_ref
from prescriptions r
join patients p on p.id = r.patient_id
left join optometrists o on o.id = r.optometrist_id
left join exams e on e.id = r.exam_id;

create or replace view v_jobs as
select j.id, j.ref, j.patient_id, p.name as patient, p.phone, j.status, j.lab, j.dispenser,
       coalesce(j.frame_desc, s.brand || ' ' || s.name) as frame, j.lens_desc,
       r.ref as rx_ref, j.ordered_on, j.promised_on, j.received_on, j.notified_on, j.collected_on,
       j.remake_reason, j.price_cents, j.invoice_id,
       (current_date - j.ordered_on) as days_since_order,
       case when j.status in ('ordered', 'remake') and j.promised_on < current_date
            then current_date - j.promised_on else 0 end as days_late,
       case when j.status in ('received', 'ready') then current_date - coalesce(j.received_on, j.ordered_on) else 0 end as days_waiting,
       coalesce(vi.balance_cents, 0) as balance_cents
from jobs j
join patients p on p.id = j.patient_id
join prescriptions r on r.id = j.rx_id
left join stock s on s.id = j.frame_id
left join v_invoices vi on vi.id = j.invoice_id;

create or replace view v_stock as
with sold as (
  select ii.stock_id, sum(ii.qty) as sold_90
  from invoice_items ii join invoices i on i.id = ii.invoice_id
  where ii.stock_id is not null and i.status <> 'void' and i.issued_on > current_date - 90
  group by ii.stock_id
),
jobbed as (
  select frame_id as stock_id, count(*) as jobs_90 from jobs
  where frame_id is not null and status <> 'cancelled' and ordered_on > current_date - 90 group by frame_id
)
select s.id, s.sku, s.kind, s.brand, s.name, s.colour, s.size, s.cost_cents, s.retail_cents,
       s.on_hand, s.reorder_at, s.received_on, s.active,
       coalesce(so.sold_90, 0) + coalesce(jb.jobs_90, 0) as moved_90,
       (current_date - s.received_on) as age_days,
       s.on_hand * s.cost_cents as value_cents,
       (s.on_hand <= s.reorder_at and s.kind <> 'frame') as low
from stock s
left join sold so on so.stock_id = s.id
left join jobbed jb on jb.stock_id = s.id;

create or replace view v_claims as
select c.id, c.ref, c.funder, c.fund_name, c.patient_id, p.name as patient, c.item, c.amount_cents, c.service_on,
       c.status, c.lodged_on, c.paid_on, c.paid_cents, c.reject_reason,
       e.ref as exam_ref, coalesce(e.status, 'none') as exam_status, j.ref as job_ref,
       (current_date - c.service_on) as days_since_service,
       case when c.lodged_on is null then null else current_date - c.lodged_on end as days_lodged
from claims c
join patients p on p.id = c.patient_id
left join exams e on e.id = c.exam_id
left join jobs j on j.id = c.job_id;

create or replace view v_recalls as
select r.id, r.patient_id, p.name as patient, p.phone, p.email, p.marketing_opt_in, r.kind, r.due_on,
       r.status, r.contacts, r.last_contacted_on,
       (current_date - r.due_on) as days_overdue,
       vp.next_appt_on, vp.last_exam_on
from recalls r
join patients p on p.id = r.patient_id
join v_patients vp on vp.patient_id = p.id
where r.status = 'open' and p.status = 'active';

-- Consults and the eyewear that followed them: the capture rate every
-- practice owner watches and no dashboard shows by optometrist.
create or replace view v_capture as
select e.id as exam_id, e.ref, e.on_date, o.name as optometrist, e.patient_id, p.name as patient,
       exists (select 1 from prescriptions r where r.exam_id = e.id and r.kind = 'spectacle') as new_spec_rx,
       exists (select 1 from jobs j where j.patient_id = e.patient_id and j.status <> 'cancelled'
               and j.ordered_on between e.on_date and e.on_date + 30) as bought
from exams e
join optometrists o on o.id = e.optometrist_id
join patients p on p.id = e.patient_id;

create or replace view v_takings as
select i.issued_on as on_date,
       case when ii.mbs_item is not null then 'consults' when ii.stock_id is not null then 'stock' else 'eyewear and other' end as line,
       sum(ii.qty * ii.unit_cents) as takings_cents
from invoices i join invoice_items ii on ii.invoice_id = i.id
where i.status <> 'void'
group by i.issued_on, 2;
