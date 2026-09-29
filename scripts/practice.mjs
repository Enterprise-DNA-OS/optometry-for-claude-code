#!/usr/bin/env node
// optometry-for-claude-code: the one CLI. Claude Code slash commands call
// this; so can you.
//
//   node scripts/practice.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system is an independent optometry practice's operating record the
// way Optomate sells it: the optometrists and their hours, the patient book,
// the appointment book, examinations with the Medicare item each one bills,
// spectacle and contact lens prescriptions with their expiry dates, frame
// and contact lens stock, spectacle jobs from order to lab to collection,
// invoices and payments, claims to Medicare, DVA and the health funds, and
// recalls. It sends nothing and connects to nothing: claims lodge through
// the funder's own channel, recalls and reminders draft to drafts/, and a
// person sends them.
//
// The gates, and there are no force flags:
//   * a comprehensive Medicare item is checked before it is billed: 10910
//     only under 65 with no comprehensive item in 36 months, 10911 only at
//     65 and over with none in 12 months, 10913 and 10914 only with the
//     clinical reason written, 10915 only for a patient with diabetes whose
//     eyes were dilated (MBS Online, optometry items)
//   * a claim never lodges for an examination that is not finalised, and a
//     finalised examination is never edited: corrections are addenda
//   * a DVA card holder is never billed a gap: their consult bills DVA
//   * a spectacle job never orders against an expired or superseded
//     prescription, and contact lenses never sell without a current
//     contact lens prescription
//   * every prescription carries an expiry date, and a copy given after it
//     has passed is marked EXPIRED (Optometry Board of Australia,
//     Guidelines: prescription of optical appliances)
//   * a finished job is not handed over with money owing on it (a setting)
//   * stock never goes below zero, and a payment never exceeds a balance
//   * nobody is double-booked, and nothing is booked outside an
//     optometrist's recorded working days and hours
//   * no deleting records: appointments cancel with a reason, patients
//     archive, jobs cancel, the clinical record stays

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getDb } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table, money as fmtMoney, price as fmtPrice, isoDate, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'ready', 'owing', 'dilated', 'diabetic', 'low', 'final', 'therapeutic']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name; let value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const hhmm = (v) => String(v ?? '').slice(0, 5);
const money = (c) => fmtMoney(c, 'AUD');
const price = (c) => fmtPrice(c, 'AUD');
const out = (flags, data) => { if (flags.json) { console.log(JSON.stringify(data, null, 2)); return true; } return false; };

function cents(v, what = 'amount') {
  if (v === undefined || v === null || v === true || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new CliError(`Cannot read ${what} "${v}". Use dollars, e.g. 120 or 120.50.`);
  return Math.round(n * 100);
}

// ---------------------------------------------------------------------------
// Dates and times

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addMonths(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // Australian and New Zealand exports write DD/MM/YYYY: the first number is
  // the day unless the second is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    let year = Number(slash[3]);
    if (year < 100) year += year > 30 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (iso) return iso[1];
  throw new CliError(`Cannot read ${what} "${s}". Use YYYY-MM-DD (or today / tomorrow / DD/MM/YYYY).`);
}

function parseTime(v, what = 'time') {
  if (!v || v === true) return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour (or 9:30am).`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour.`);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function addMinutes(hm, minutes) {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) throw new CliError(`That appointment runs past midnight (${hm} + ${minutes} minutes). Start earlier.`);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekdayOf = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];

async function setting(db, key, dflt) {
  const [row] = await db.query('select value from settings where key = $1', [key]);
  return row ? row.value : dflt;
}

// ---------------------------------------------------------------------------
// Resolvers: partial names, case-insensitive, list-and-exit-1 when ambiguous

async function resolvePatient(db, query, { includeArchived = false } = {}) {
  if (!query) throw new CliError('Which patient? Give a name (partial is fine).');
  const q = String(query).trim();
  const rows = await db.query(
    `select * from v_patients where name ilike $1 ${includeArchived ? '' : `and status = 'active'`} order by name`,
    [`%${q}%`],
  );
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No patient matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} patients:\n${rows.map((r) => `  ${r.name}${r.date_of_birth ? ` (born ${isoDate(r.date_of_birth)})` : ''}`).join('\n')}\nSay more of the name.`);
}

async function resolveOptometrist(db, query) {
  if (!query) throw new CliError('Which optometrist? Give a name (partial is fine). See: team');
  const q = String(query).trim();
  const rows = await db.query(`select * from optometrists where name ilike $1 and status = 'active' order by name`, [`%${q}%`]);
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No optometrist matches "${q}". See: team`);
  throw new CliError(`"${q}" matches ${rows.length} optometrists: ${rows.map((r) => r.name).join(', ')}. Say more of the name.`);
}

async function resolveService(db, query) {
  if (!query) throw new CliError('Which service? Give its code or name (partial is fine). See: services');
  const q = String(query).trim();
  const byCode = await db.query('select * from services where upper(code) = upper($1) and active', [q]);
  if (byCode.length === 1) return byCode[0];
  const rows = await db.query('select * from services where name ilike $1 and active order by name', [`%${q}%`]);
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No service matches "${q}". See: services`);
  throw new CliError(`"${q}" matches ${rows.length} services: ${rows.map((r) => `${r.code} ${r.name}`).join(', ')}. Say more.`);
}

async function resolveRef(db, view, prefix, ref, what) {
  if (!ref) throw new CliError(`Which ${what}? Give its reference (${prefix}-...).`);
  let q = String(ref).trim().toUpperCase();
  if (/^\d+$/.test(q)) q = `${prefix}-${q}`;
  const rows = await db.query(`select * from ${view} where upper(ref) = $1`, [q]);
  if (rows.length === 1) return rows[0];
  throw new CliError(`No ${what} matches "${ref}".`);
}

const resolveAppointment = (db, ref) => resolveRef(db, 'v_appointments', 'APT', ref, 'appointment');
const resolveRx = (db, ref) => resolveRef(db, 'v_prescriptions', 'RX', ref, 'prescription');
const resolveJob = (db, ref) => resolveRef(db, 'v_jobs', 'JOB', ref, 'job');
const resolveInvoice = (db, ref) => resolveRef(db, 'v_invoices', 'INV', ref, 'invoice');
const resolveClaim = (db, ref) => resolveRef(db, 'v_claims', 'CLM', ref, 'claim');

async function resolveExam(db, ref) {
  if (!ref) throw new CliError('Which examination? Give EXM-... or the appointment APT-....');
  const q = String(ref).trim().toUpperCase();
  const rows = await db.query(
    `select e.*, p.name as patient, o.name as optometrist, a.ref as appointment_ref
     from exams e join patients p on p.id = e.patient_id join optometrists o on o.id = e.optometrist_id
     left join appointments a on a.id = e.appointment_id
     where upper(e.ref) = $1 or upper(a.ref) = $1 or e.ref = 'EXM-' || $1`,
    [q],
  );
  if (rows.length === 1) return rows[0];
  throw new CliError(`No examination matches "${ref}". A completed consult with no examination yet: exam record APT-... creates it.`);
}

async function resolveStock(db, query) {
  if (!query) throw new CliError('Which item? Give its SKU or name (partial is fine). See: stock');
  const q = String(query).trim();
  const bySku = await db.query('select * from v_stock where upper(sku) = upper($1)', [q]);
  if (bySku.length === 1) return bySku[0];
  const rows = await db.query(`select * from v_stock where (brand || ' ' || name) ilike $1 or sku ilike $1 order by sku`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No stock matches "${q}". See: stock`);
  throw new CliError(`"${q}" matches ${rows.length} items: ${rows.map((r) => `${r.sku} (${r.brand} ${r.name})`).join(', ')}. Say more.`);
}

async function mintRef(db, tableName, prefix, start) {
  const [row] = await db.query(
    `select max(nullif(regexp_replace(ref, '^[A-Z]+-', ''), '')::int) as n from ${tableName} where ref ~ $1`,
    [`^${prefix}-[0-9]+$`],
  );
  return `${prefix}-${Math.max(num(row.n) + 1, start)}`;
}

// ---------------------------------------------------------------------------
// The Medicare item rules. One place, used by booking, completing, finalising
// and the compliance check.

const COMPREHENSIVE = ['10905', '10907', '10910', '10911', '10913', '10914', '10915'];

async function lastComprehensive(db, patientId, beforeDate, excludeExamId = null) {
  const [row] = await db.query(
    `select ref, on_date, mbs_item from exams
     where patient_id = $1 and mbs_item = any($2) and on_date <= $3 and ($4::uuid is null or id <> $4::uuid)
     order by on_date desc limit 1`,
    [patientId, COMPREHENSIVE, beforeDate, excludeExamId],
  );
  return row || null;
}

function ageOn(dob, onDate) {
  if (!dob) return null;
  const b = new Date(`${isoDate(dob)}T00:00:00`);
  const d = new Date(`${onDate}T00:00:00`);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}

// Returns null when the item can bill, or the refusal with its fix.
async function itemProblem(db, patient, item, onDate, { reason = null, excludeExamId = null } = {}) {
  if (!item) return null;
  const name = patient.name;
  const age = ageOn(patient.date_of_birth, onDate);
  if (item === '10910' || item === '10911') {
    if (age === null) return `${name} has no date of birth on file, and ${item} depends on age. Record it first: patient set "${name}" --dob=YYYY-MM-DD`;
    if (item === '10910' && age >= 65) return `${name} is ${age}: 10910 is for patients under 65. Bill 10911.`;
    if (item === '10911' && age < 65) return `${name} is ${age}: 10911 is for patients 65 and over. Bill 10910.`;
    const months = item === '10910' ? 36 : 12;
    const last = await lastComprehensive(db, patient.patient_id || patient.id, onDate, excludeExamId);
    if (last && addMonths(isoDate(last.on_date), months) > onDate) {
      return `${name} had a comprehensive consult (${last.mbs_item}, ${last.ref}) on ${isoDate(last.on_date)}. ${item} is payable once in ${months} months, so it is not claimable until ${addMonths(isoDate(last.on_date), months)}. If there is a significant change in vision or new signs or symptoms, bill 10913 and write the reason: --item=10913 --reason="...". A progressive disorder under review is 10914. Otherwise bill it privately: --billing=private`;
    }
    return null;
  }
  if (item === '10913' || item === '10914') {
    if (!reason) return `${item} needs the clinical reason on the record (${item === '10913' ? 'a significant change in visual function, or new signs or symptoms' : 'the progressive disorder being reviewed'}). Add it: --reason="..."`;
    return null;
  }
  if (item === '10915') {
    if (!patient.diabetic) return `10915 is the dilated examination for a patient with diabetes, and ${name} is not recorded as diabetic. If they are: patient set "${name}" --diabetic. Otherwise bill 10910 or 10911.`;
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The appointment book

async function bookingGates(db, { patient, optometrist, onDate, startsAt, endsAt, excludeId = null }) {
  if (patient.status !== 'active') throw new CliError(`${patient.name} is archived. Restore them first: patient set "${patient.name}" --status=active`);
  if (optometrist) {
    const day = weekdayOf(onDate);
    const days = String(optometrist.days).split(',').map((d) => d.trim().toLowerCase());
    if (!days.includes(day)) throw new CliError(`${optometrist.name} does not work ${day} (${optometrist.days}). Pick another day or another optometrist.`);
    if (startsAt < hhmm(optometrist.starts_at) || endsAt > hhmm(optometrist.ends_at)) {
      throw new CliError(`${startsAt} to ${endsAt} is outside ${optometrist.name}'s hours (${hhmm(optometrist.starts_at)} to ${hhmm(optometrist.ends_at)}).`);
    }
    const clash = await db.query(
      `select ref, patient, starts_at, ends_at from v_appointments
       where optometrist_id = $1 and on_date = $2 and status in ('booked', 'confirmed', 'completed')
         and starts_at < $4 and ends_at > $3 and ($5::uuid is null or id <> $5::uuid)`,
      [optometrist.id, onDate, startsAt, endsAt, excludeId],
    );
    if (clash.length) throw new CliError(`${optometrist.name} already has ${clash[0].patient} at ${hhmm(clash[0].starts_at)} to ${hhmm(clash[0].ends_at)} (${clash[0].ref}). Pick another time: gaps`);
  }
  const own = await db.query(
    `select ref, starts_at from v_appointments where patient_id = $1 and on_date = $2 and status in ('booked', 'confirmed')
       and starts_at < $4 and ends_at > $3 and ($5::uuid is null or id <> $5::uuid)`,
    [patient.patient_id, onDate, startsAt, endsAt, excludeId],
  );
  if (own.length) throw new CliError(`${patient.name} is already booked at ${hhmm(own[0].starts_at)} that day (${own[0].ref}).`);
}

function apptRow(r) {
  return {
    ref: r.ref, date: isoDate(r.on_date), at: hhmm(r.starts_at), optometrist: r.optometrist || '(dispensing)',
    patient: r.patient, service: r.service, item: r.mbs_item || '', status: r.status, reason: r.reason || '',
  };
}

async function cmdDay(db, flags) {
  const onDate = parseDate(flags.date || 'today');
  const rows = await db.query(
    `select * from v_appointments where on_date = $1 and status in ('booked', 'confirmed', 'completed', 'dna') order by starts_at`,
    [onDate],
  );
  const result = [];
  for (const r of rows) {
    const [p] = await db.query('select * from v_patients where patient_id = $1', [r.patient_id]);
    const alerts = [];
    if (r.status === 'booked') alerts.push('UNCONFIRMED');
    const problem = await itemProblem(db, p, r.mbs_item, onDate);
    if (problem) alerts.push(`NOT ${r.mbs_item}: last comprehensive ${isoDate(p.last_comprehensive_on)}`);
    if (p.dva_number) alerts.push('DVA, no gap');
    if (p.diabetic) alerts.push('diabetic: dilate');
    if (p.conditions) alerts.push(p.conditions);
    if (num(p.balance_cents) > 0) alerts.push(`owes ${money(p.balance_cents)}`);
    const jobs = await db.query(`select ref, status from jobs where patient_id = $1 and status in ('received', 'ready')`, [r.patient_id]);
    for (const j of jobs) alerts.push(`${j.ref} ready to collect`);
    result.push({ ...apptRow(r), alerts: alerts.join('; ') });
  }
  if (out(flags, result)) return;
  console.log(heading(`The day sheet, ${onDate} (${weekdayOf(onDate)})`));
  console.log(table(result, [
    { key: 'at', label: 'at' }, { key: 'ref', label: 'ref' }, { key: 'optometrist', label: 'optometrist' },
    { key: 'patient', label: 'patient' }, { key: 'service', label: 'service', width: 30 }, { key: 'item', label: 'item' },
    { key: 'status', label: 'status' }, { key: 'alerts', label: 'before they walk in', width: 60 },
  ]));
}

async function cmdBook(db, flags) {
  const from = parseDate(flags.from || 'today');
  const days = num(flags.days || 7);
  const params = [from, addDays(from, days)];
  let extra = '';
  if (flags.optometrist) { const o = await resolveOptometrist(db, flags.optometrist); params.push(o.id); extra = ` and optometrist_id = $${params.length}`; }
  const rows = await db.query(
    `select * from v_appointments where on_date >= $1 and on_date < $2 and status in ('booked', 'confirmed')${extra} order by on_date, starts_at`,
    params,
  );
  const result = rows.map(apptRow);
  if (out(flags, result)) return;
  console.log(heading(`The book, ${from} for ${days} days`));
  console.log(table(result, [
    { key: 'date', label: 'date' }, { key: 'at', label: 'at' }, { key: 'ref', label: 'ref' }, { key: 'optometrist', label: 'optometrist' },
    { key: 'patient', label: 'patient' }, { key: 'service', label: 'service', width: 34 }, { key: 'item', label: 'item' },
    { key: 'status', label: 'status', format: (v) => (v === 'booked' ? 'UNCONFIRMED' : v) },
  ]));
}

async function cmdBookAdd(db, args, flags) {
  const patient = await resolvePatient(db, args.join(' '));
  const service = await resolveService(db, flags.service || 'CE');
  const optometrist = service.kind === 'dispense' && !flags.optometrist ? null : await resolveOptometrist(db, flags.optometrist);
  const onDate = parseDate(flags.date);
  if (!onDate) throw new CliError('Which day? --date=YYYY-MM-DD (or tomorrow).');
  const startsAt = parseTime(flags.time);
  if (!startsAt) throw new CliError('What time? --time=HH:MM');
  const endsAt = addMinutes(startsAt, num(service.minutes));
  await bookingGates(db, { patient, optometrist, onDate, startsAt, endsAt });
  const warnings = [];
  const problem = await itemProblem(db, patient, service.mbs_item, onDate, { reason: 'booking' });
  if (problem) warnings.push(problem);
  const ref = await mintRef(db, 'appointments', 'APT', 1001);
  await db.query(
    `insert into appointments (ref, patient_id, optometrist_id, service_id, on_date, starts_at, ends_at, reason) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ref, patient.patient_id, optometrist?.id || null, service.id, onDate, startsAt, endsAt, str(flags.reason) || null],
  );
  // A recall is answered by the booking.
  await db.query(`update recalls set status = 'booked' where patient_id = $1 and status = 'open' and due_on <= $2::date + 60`, [patient.patient_id, onDate]);
  const result = { ref, patient: patient.name, optometrist: optometrist?.name || null, service: service.name, date: onDate, at: startsAt, ends: endsAt, warnings };
  if (out(flags, result)) return;
  console.log(`Booked ${ref}: ${patient.name}, ${service.name}${optometrist ? ` with ${optometrist.name}` : ''}, ${onDate} ${startsAt} to ${endsAt}.`);
  for (const w of warnings) console.log(`  Before the day: ${w}`);
}

async function setApptStatus(db, args, flags, status) {
  const apt = await resolveAppointment(db, args[0]);
  if (!['booked', 'confirmed'].includes(apt.status)) throw new CliError(`${apt.ref} is ${apt.status}; only a booked or confirmed appointment can be ${status}.`);
  if (status === 'cancelled') {
    const reason = str(flags.reason);
    if (!reason) throw new CliError('Cancelling needs a reason: --reason="..." (nothing is deleted; the book keeps the history).');
    await db.query(`update appointments set status = 'cancelled', cancel_reason = $2 where id = $1`, [apt.id, reason]);
  } else if (status === 'dna') {
    if (isoDate(apt.on_date) > today()) throw new CliError(`${apt.ref} is on ${isoDate(apt.on_date)}; a no-show can only be marked on or after the day.`);
    await db.query(`update appointments set status = 'dna' where id = $1`, [apt.id]);
  } else {
    await db.query('update appointments set status = $2 where id = $1', [apt.id, status]);
  }
  const [habit] = await db.query(`select count(*) as n from appointments where patient_id = $1 and status = 'dna' and on_date > current_date - 365`, [apt.patient_id]);
  const result = { ref: apt.ref, patient: apt.patient, status, dnas_12m: num(habit.n) };
  if (out(flags, result)) return;
  console.log(`${apt.ref} (${apt.patient}) is now ${status}.${status === 'dna' ? ` That is ${habit.n} no-show(s) in 12 months.` : ''}`);
}

// ---------------------------------------------------------------------------
// Completing a consult: the examination, the invoice, the claim

async function newInvoice(db, { patientId, payer, lines, dueOn = today() }) {
  const ref = await mintRef(db, 'invoices', 'INV', 2001);
  const [inv] = await db.query(
    `insert into invoices (ref, patient_id, payer, due_on) values ($1, $2, $3, $4) returning id, ref`,
    [ref, patientId, payer, dueOn],
  );
  for (const l of lines) {
    await db.query(
      `insert into invoice_items (invoice_id, description, qty, unit_cents, mbs_item, stock_id) values ($1, $2, $3, $4, $5, $6)`,
      [inv.id, l.description, l.qty || 1, l.unit_cents, l.mbs_item || null, l.stock_id || null],
    );
  }
  return inv;
}

async function recordPayment(db, invoiceId, amountCents, method, paidOn = today()) {
  const [inv] = await db.query('select * from v_invoices where id = $1', [invoiceId]);
  if (amountCents <= 0) throw new CliError('A payment must be more than zero.');
  if (amountCents > num(inv.balance_cents)) throw new CliError(`${inv.ref} has ${money(inv.balance_cents)} owing; a payment of ${money(amountCents)} is more than that.`);
  await db.query('insert into payments (invoice_id, amount_cents, method, paid_on) values ($1, $2, $3, $4)', [invoiceId, amountCents, method, paidOn]);
  if (amountCents === num(inv.balance_cents)) await db.query(`update invoices set status = 'paid' where id = $1`, [invoiceId]);
  return num(inv.balance_cents) - amountCents;
}

async function cmdComplete(db, args, flags) {
  const apt = await resolveAppointment(db, args[0]);
  if (!['booked', 'confirmed'].includes(apt.status)) throw new CliError(`${apt.ref} is ${apt.status}; only a booked or confirmed appointment can be completed.`);
  if (isoDate(apt.on_date) > today()) throw new CliError(`${apt.ref} is on ${isoDate(apt.on_date)}. It can be completed on the day.`);
  const [patient] = await db.query('select * from v_patients where patient_id = $1', [apt.patient_id]);
  const [service] = await db.query('select * from services where code = $1', [apt.service_code]);
  const onDate = isoDate(apt.on_date);

  if (service.kind === 'dispense') {
    await db.query(`update appointments set status = 'completed' where id = $1`, [apt.id]);
    const result = { ref: apt.ref, patient: apt.patient, status: 'completed', exam: null, invoice: null, claim: null };
    if (out(flags, result)) return;
    console.log(`${apt.ref} completed. For the glasses themselves: job collect JOB-...`);
    return;
  }

  const item = flags.item === 'none' ? null : str(flags.item) || service.mbs_item || null;
  const reason = str(flags.reason) || null;
  let billing = str(flags.billing) || (item ? (patient.dva_number ? 'dva' : 'bulk') : 'private');
  if (!['bulk', 'private', 'dva', 'none'].includes(billing)) throw new CliError('--billing is bulk, private, dva or none.');
  if (patient.dva_number && billing === 'private' && item) {
    throw new CliError(`${patient.name} is a DVA card holder (${patient.dva_number}): the consult bills DVA and the veteran never pays a gap. Use --billing=dva.`);
  }
  if (billing === 'dva' && !patient.dva_number) throw new CliError(`${patient.name} has no DVA number on file. Record it (patient set --dva=...) or bill another way.`);
  if (billing !== 'private' && billing !== 'none') {
    const problem = await itemProblem(db, patient, item, onDate, { reason });
    if (problem) throw new CliError(problem);
  }

  const fee = flags.fee !== undefined ? cents(flags.fee, 'fee') : num(service.fee_cents);
  const examRef = await mintRef(db, 'exams', 'EXM', 501);
  const [exam] = await db.query(
    `insert into exams (ref, appointment_id, patient_id, optometrist_id, on_date, mbs_item, billing, item_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [examRef, apt.id, apt.patient_id, apt.optometrist_id, onDate, item, billing, reason],
  );
  await db.query(`update appointments set status = 'completed' where id = $1`, [apt.id]);

  let invoice = null;
  let claim = null;
  const label = `${service.name}${item ? ` (MBS ${item})` : ''}`;
  if (billing === 'bulk' || billing === 'dva') {
    const payer = billing === 'bulk' ? 'medicare' : 'dva';
    invoice = await newInvoice(db, { patientId: apt.patient_id, payer, lines: [{ description: label + (payer === 'dva' ? ', DVA' : ''), unit_cents: fee, mbs_item: item }] });
    const claimRef = await mintRef(db, 'claims', 'CLM', 4001);
    await db.query(
      `insert into claims (ref, funder, patient_id, exam_id, invoice_id, item, amount_cents, service_on) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [claimRef, payer, apt.patient_id, exam.id, invoice.id, item, fee, onDate],
    );
    claim = { ref: claimRef, funder: payer, amount_cents: fee };
  } else if (billing === 'private' && fee > 0) {
    invoice = await newInvoice(db, { patientId: apt.patient_id, payer: 'patient', lines: [{ description: label, unit_cents: fee, mbs_item: item }] });
    if (flags.paid) await recordPayment(db, invoice.id, fee, str(flags.paid) === 'true' ? 'eftpos' : str(flags.paid));
  }
  const result = { ref: apt.ref, patient: apt.patient, exam: examRef, item, billing, invoice: invoice?.ref || null, claim };
  if (out(flags, result)) return;
  console.log(`${apt.ref} completed: ${apt.patient}, ${label}, billed ${billing}.`);
  if (invoice) console.log(`  Invoiced ${invoice.ref}: ${money(fee)}.`);
  if (claim) console.log(`  Claim ${claim.ref} to ${claim.funder.toUpperCase()} is ready, and lodges once the examination is final.`);
  console.log(`  Now the record: exam record ${examRef} --findings="..." --management="..." then exam final ${examRef}`);
}

// ---------------------------------------------------------------------------
// Examinations

const EXAM_FIELDS = {
  'va-right': 'va_right', 'va-left': 'va_left', 'iop-right': 'iop_right', 'iop-left': 'iop_left',
  history: 'history', findings: 'findings', management: 'management', recall: 'recall_months', 'recall-kind': 'recall_kind',
  reason: 'item_reason', item: 'mbs_item',
};

async function cmdExamRecord(db, args, flags) {
  let exam;
  const q = String(args[0] || '').toUpperCase();
  if (q.startsWith('APT')) {
    const apt = await resolveAppointment(db, q);
    const [existing] = await db.query('select ref from exams where appointment_id = $1', [apt.id]);
    if (existing) exam = await resolveExam(db, existing.ref);
    else {
      if (apt.status !== 'completed') throw new CliError(`${apt.ref} is ${apt.status}. Complete it first: complete ${apt.ref}`);
      const ref = await mintRef(db, 'exams', 'EXM', 501);
      await db.query(
        `insert into exams (ref, appointment_id, patient_id, optometrist_id, on_date, mbs_item, billing) values ($1, $2, $3, $4, $5, $6, 'none')`,
        [ref, apt.id, apt.patient_id, apt.optometrist_id, isoDate(apt.on_date), null],
      );
      exam = await resolveExam(db, ref);
    }
  } else exam = await resolveExam(db, q);
  if (exam.status === 'final') throw new CliError(`${exam.ref} is finalised and never changes. Add a dated correction: exam addendum ${exam.ref} "..."`);
  const sets = [];
  const params = [exam.id];
  for (const [flag, col] of Object.entries(EXAM_FIELDS)) {
    if (flags[flag] === undefined || flags[flag] === true) continue;
    let v = str(flags[flag]);
    if (col === 'recall_months') v = num(v);
    if (col === 'iop_right' || col === 'iop_left') v = Number(v);
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  if (flags.dilated) sets.push('dilated = true');
  if (!sets.length) throw new CliError('Nothing to record. Use --history= --findings= --management= --va-right= --va-left= --iop-right= --iop-left= --dilated --recall=12 --recall-kind="..."');
  await db.query(`update exams set ${sets.join(', ')} where id = $1`, params);
  const result = await resolveExam(db, exam.ref);
  if (out(flags, result)) return;
  console.log(`${exam.ref} (${exam.patient}) updated, still in draft. Finalise it when it is complete: exam final ${exam.ref}`);
}

async function cmdExamFinal(db, args, flags) {
  const exam = await resolveExam(db, args[0]);
  if (exam.status === 'final') throw new CliError(`${exam.ref} is already final.`);
  const missing = [];
  if (!exam.findings) missing.push('--findings');
  if (!exam.management) missing.push('--management');
  if (missing.length) throw new CliError(`${exam.ref} cannot be finalised without ${missing.join(' and ')}. The record is what Medicare and the Board ask for. exam record ${exam.ref} ${missing.map((m) => `${m}="..."`).join(' ')}`);
  if (exam.mbs_item === '10915' && !exam.dilated) throw new CliError(`${exam.ref} bills 10915, the dilated examination for a patient with diabetes, and dilation is not recorded. If the eyes were dilated: exam record ${exam.ref} --dilated. If not, the item is wrong.`);
  if ((exam.mbs_item === '10913' || exam.mbs_item === '10914') && !exam.item_reason) throw new CliError(`${exam.ref} bills ${exam.mbs_item} and the clinical reason is not written: exam record ${exam.ref} --reason="..."`);
  await db.query(`update exams set status = 'final', finalised_at = now() where id = $1`, [exam.id]);
  let recall = null;
  if (num(exam.recall_months) > 0) {
    const due = addMonths(isoDate(exam.on_date), num(exam.recall_months));
    const kind = exam.recall_kind || 'eye examination';
    await db.query(`update recalls set status = 'done' where patient_id = $1 and status in ('open', 'booked')`, [exam.patient_id]);
    await db.query('insert into recalls (patient_id, kind, due_on, exam_id) values ($1, $2, $3, $4)', [exam.patient_id, kind, due, exam.id]);
    recall = { kind, due_on: due };
  }
  const result = { ref: exam.ref, patient: exam.patient, status: 'final', recall };
  if (out(flags, result)) return;
  console.log(`${exam.ref} (${exam.patient}) is final. From here, corrections are addenda.`);
  if (recall) console.log(`  Recall set: ${recall.kind}, due ${recall.due_on}.`);
  const [c] = await db.query(`select ref from claims where exam_id = $1 and status = 'ready'`, [exam.id]);
  if (c) console.log(`  Its claim ${c.ref} can lodge now: claim lodge ${c.ref}`);
}

async function cmdExamAddendum(db, args, flags) {
  const exam = await resolveExam(db, args[0]);
  const body = args.slice(1).join(' ') || str(flags.text);
  if (!body) throw new CliError(`What is the correction? exam addendum ${exam.ref} "..."`);
  if (exam.status !== 'final') throw new CliError(`${exam.ref} is still a draft. Change it directly: exam record ${exam.ref} --findings="..."`);
  await db.query('insert into exam_addenda (exam_id, body) values ($1, $2)', [exam.id, body]);
  if (out(flags, { ref: exam.ref, addendum: body })) return;
  console.log(`Addendum added to ${exam.ref}, dated today. The original stays as it was.`);
}

async function cmdExamShow(db, args, flags) {
  const exam = await resolveExam(db, args[0]);
  const addenda = await db.query('select body, created_at from exam_addenda where exam_id = $1 order by created_at', [exam.id]);
  const rx = await db.query('select ref, kind, expires_on from prescriptions where exam_id = $1', [exam.id]);
  if (out(flags, { ...exam, addenda, prescriptions: rx })) return;
  console.log(heading(`${exam.ref}: ${exam.patient}, ${isoDate(exam.on_date)} with ${exam.optometrist}`));
  console.log(`  Item ${exam.mbs_item || 'none'} (${exam.billing})${exam.item_reason ? `, because: ${exam.item_reason}` : ''}. Status: ${exam.status.toUpperCase()}.`);
  console.log(`  VA R ${exam.va_right || '-'}  L ${exam.va_left || '-'}   IOP R ${exam.iop_right ?? '-'}  L ${exam.iop_left ?? '-'}${exam.dilated ? '   dilated' : ''}`);
  for (const [k, label] of [['history', 'History'], ['findings', 'Findings'], ['management', 'Management']]) console.log(`  ${label}: ${exam[k] || '(not written)'}`);
  if (exam.recall_months) console.log(`  Recall: ${exam.recall_kind || 'eye examination'} in ${exam.recall_months} months`);
  for (const r of rx) console.log(`  Prescription ${r.ref} (${r.kind}), expires ${isoDate(r.expires_on)}`);
  for (const a of addenda) console.log(`  Addendum ${String(a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at).slice(0, 10)}: ${a.body}`);
}

async function cmdExamsDue(db, flags) {
  const rows = await db.query('select * from v_exams_due order by on_date');
  const result = rows.map((r) => ({ ref: r.ref, exam: r.exam_ref || '', date: isoDate(r.on_date), days: num(r.days_since), patient: r.patient, optometrist: r.optometrist, state: r.exam_state }));
  if (out(flags, result)) return;
  console.log(heading('Examinations not finalised, oldest first'));
  console.log(table(result, [
    { key: 'date', label: 'consult' }, { key: 'days', label: 'days', align: 'right' }, { key: 'ref', label: 'appt' }, { key: 'exam', label: 'exam' },
    { key: 'patient', label: 'patient' }, { key: 'optometrist', label: 'optometrist' }, { key: 'state', label: 'state', format: (v) => v.toUpperCase() },
  ]));
  if (result.length) console.log('\n  A consult without a final examination cannot claim, and cannot be defended. Write them today.');
}

async function cmdEligibility(db, args, flags) {
  const on = parseDate(flags.date || 'today');
  const patients = args.length ? [await resolvePatient(db, args.join(' '))] : await db.query(`select * from v_patients where status = 'active' order by name`);
  const result = [];
  for (const p of patients) {
    const age = ageOn(p.date_of_birth, on);
    const routine = age === null ? null : age >= 65 ? '10911' : '10910';
    const problem = routine ? await itemProblem(db, p, routine, on) : 'no date of birth on file';
    const last = await lastComprehensive(db, p.patient_id, on);
    result.push({
      patient: p.name, age, routine_item: routine,
      last_comprehensive: last ? `${last.mbs_item} ${isoDate(last.on_date)}` : 'none on record',
      claimable_now: !problem,
      claimable_from: last && routine ? addMonths(isoDate(last.on_date), routine === '10911' ? 12 : 36) : on,
      diabetic: p.diabetic,
    });
  }
  if (out(flags, args.length ? result[0] : result)) return;
  console.log(heading(`Medicare comprehensive consult, as at ${on}`));
  console.log(table(result, [
    { key: 'patient', label: 'patient' }, { key: 'age', label: 'age', align: 'right' }, { key: 'routine_item', label: 'item' },
    { key: 'last_comprehensive', label: 'last comprehensive' }, { key: 'claimable_now', label: 'claimable now', format: (v) => (v ? 'yes' : 'NO') },
    { key: 'claimable_from', label: 'from' }, { key: 'diabetic', label: '', format: (v) => (v ? '10915 eligible' : '') },
  ]));
  console.log('\n  Only the consults on this record count. A patient seen elsewhere may have used the item already: ask, and check with Medicare before bulk billing a new patient.');
}

// ---------------------------------------------------------------------------
// Prescriptions

// "-1.25 -0.50 x180" -> { sph, cyl, axis }. "plano" reads as 0.
function parseEye(v, eye) {
  if (!v || v === true) return { sph: null, cyl: null, axis: null };
  const s = String(v).toLowerCase().replace(/plano|pl/g, '0').replace(/ds/g, '').trim();
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*\/?\s*([+-]?\d+(?:\.\d+)?)\s*(?:x|@)\s*(\d{1,3}))?$/);
  if (!m) throw new CliError(`Cannot read the ${eye} eye "${v}". Write it as sphere, or sphere cylinder x axis: "-1.25 -0.50 x180".`);
  const axis = m[3] ? Number(m[3]) : null;
  if (axis !== null && (axis < 0 || axis > 180)) throw new CliError(`Axis ${axis} for the ${eye} eye is outside 0 to 180.`);
  return { sph: Number(m[1]), cyl: m[2] ? Number(m[2]) : null, axis };
}

const signed = (v) => (v === null || v === undefined ? '' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}`);
const eyeText = (sph, cyl, axis, add) => `${sph === null || sph === undefined ? '' : Number(sph) === 0 ? 'plano' : signed(sph)}${cyl !== null && cyl !== undefined ? ` / ${signed(cyl)} x ${axis}` : ''}${add ? `  add ${signed(add)}` : ''}`;

function rxRow(r) {
  return {
    ref: r.ref, patient: r.patient, kind: r.kind === 'contact_lens' ? 'contact lens' : 'spectacle',
    right: eyeText(r.r_sph, r.r_cyl, r.r_axis, r.r_add), left: eyeText(r.l_sph, r.l_cyl, r.l_axis, r.l_add),
    issued: isoDate(r.issued_on), expires: isoDate(r.expires_on), days_to_expiry: num(r.days_to_expiry),
    state: r.status === 'superseded' ? 'superseded' : r.expired ? 'EXPIRED' : 'current', lens: r.lens || '',
  };
}

async function cmdRxList(db, args, flags) {
  const patient = await resolvePatient(db, args.join(' '), { includeArchived: true });
  const rows = await db.query('select * from v_prescriptions where patient_id = $1 order by issued_on desc', [patient.patient_id]);
  const result = rows.map(rxRow);
  if (out(flags, result)) return;
  console.log(heading(`Prescriptions: ${patient.name}`));
  console.log(table(result, [
    { key: 'ref', label: 'rx' }, { key: 'kind', label: 'kind' }, { key: 'right', label: 'right' }, { key: 'left', label: 'left' },
    { key: 'issued', label: 'issued' }, { key: 'expires', label: 'expires' }, { key: 'state', label: 'state' }, { key: 'lens', label: 'lens', width: 40 },
  ]));
}

async function cmdRxAdd(db, args, flags) {
  const patient = await resolvePatient(db, args.join(' '));
  const kind = str(flags.kind || 'spectacle').replace('-', '_').replace(/^cl$|^contact$|^contacts$/, 'contact_lens');
  if (!['spectacle', 'contact_lens'].includes(kind)) throw new CliError('--kind is spectacle or contact-lens.');
  if (kind === 'contact_lens' && !flags.lens) throw new CliError('A contact lens prescription names the lens: --lens="brand, base curve, diameter, modality".');
  const r = parseEye(flags.right, 'right');
  const l = parseEye(flags.left, 'left');
  if (r.sph === null && l.sph === null) throw new CliError('The prescription needs at least one eye: --right="-1.25 -0.50 x180" --left="-1.00"');
  const add = flags.add ? Number(flags.add) : null;
  const issued = parseDate(flags.date || 'today');
  const months = num(flags.months || (await setting(db, kind === 'spectacle' ? 'spectacle_rx_months' : 'contact_lens_rx_months', kind === 'spectacle' ? '24' : '12')));
  const expires = flags.expires ? parseDate(flags.expires, 'expiry') : addMonths(issued, months);
  if (expires <= issued) throw new CliError('The expiry date has to be after the issue date.');
  if (daysBetween(issued, expires) < 90) throw new CliError(`An expiry ${daysBetween(issued, expires)} days out is unreasonably short for a final prescription (Optometry Board of Australia guideline). For trial lenses write it as a preliminary prescription in --notes and give it at least 90 days.`);
  let examId = null;
  let optometristId = null;
  const [exam] = flags.exam ? [await resolveExam(db, flags.exam)] : await db.query('select id, optometrist_id from exams where patient_id = $1 order by on_date desc limit 1', [patient.patient_id]);
  if (exam) { examId = exam.id; optometristId = exam.optometrist_id; }
  await db.query(`update prescriptions set status = 'superseded' where patient_id = $1 and kind = $2 and status = 'active'`, [patient.patient_id, kind]);
  const ref = await mintRef(db, 'prescriptions', 'RX', 701);
  await db.query(
    `insert into prescriptions (ref, patient_id, exam_id, optometrist_id, kind, issued_on, expires_on, r_sph, r_cyl, r_axis, r_add, l_sph, l_cyl, l_axis, l_add, pd, lens, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [ref, patient.patient_id, examId, optometristId, kind, issued, expires, r.sph, r.cyl, r.axis, add, l.sph, l.cyl, l.axis, add, str(flags.pd) || null, str(flags.lens) || null, str(flags.notes) || null],
  );
  const [row] = await db.query('select * from v_prescriptions where ref = $1', [ref]);
  if (out(flags, rxRow(row))) return;
  console.log(`${ref}: ${patient.name}'s ${kind.replace('_', ' ')} prescription, issued ${issued}, expires ${expires}. Any earlier one of the same kind is now superseded.`);
}

async function cmdRxRelease(db, args, flags) {
  const rx = await resolveRx(db, args[0]);
  await db.query('update prescriptions set released_on = current_date where id = $1', [rx.id]);
  const row = rxRow(rx);
  const result = { ...row, released_on: today(), note: rx.expired ? 'This copy is marked EXPIRED.' : null };
  if (out(flags, result)) return;
  console.log(heading(`${rx.kind === 'contact_lens' ? 'Contact lens' : 'Spectacle'} prescription ${rx.ref}${rx.expired ? '  (EXPIRED)' : ''}`));
  console.log(`  Patient:      ${rx.patient}`);
  console.log(`  Right:        ${row.right}`);
  console.log(`  Left:         ${row.left}`);
  if (rx.pd) console.log(`  PD:           ${rx.pd}`);
  if (rx.lens) console.log(`  Lens:         ${rx.lens}`);
  console.log(`  Issued:       ${row.issued} by ${rx.optometrist || '(optometrist)'}`);
  console.log(`  Expires:      ${row.expires}`);
  console.log(`\n  Recorded as released today. The printable copy: npm run docs -- prescription`);
}

async function cmdRxExpiring(db, flags) {
  const days = num(flags.days || (await setting(db, 'rx_warn_days', '45')));
  const rows = await db.query(
    `select r.*, vp.next_appt_on from v_prescriptions r join v_patients vp on vp.patient_id = r.patient_id
     where r.status = 'active' and vp.status = 'active' and r.days_to_expiry <= $1 and r.days_to_expiry > -60
     order by r.expires_on`,
    [days],
  );
  const result = rows.map((r) => ({ ...rxRow(r), phone: r.phone || '', next_appt: isoDate(r.next_appt_on), opt_in: r.marketing_opt_in }));
  if (out(flags, result)) return;
  console.log(heading(`Prescriptions expiring inside ${days} days, or lapsed in the last 60`));
  console.log(table(result, [
    { key: 'ref', label: 'rx' }, { key: 'patient', label: 'patient' }, { key: 'kind', label: 'kind' }, { key: 'expires', label: 'expires' },
    { key: 'days_to_expiry', label: 'days', align: 'right' }, { key: 'state', label: 'state' }, { key: 'next_appt', label: 'next appt', format: (v) => v || 'NONE' }, { key: 'phone', label: 'phone' },
  ]));
}

// ---------------------------------------------------------------------------
// Spectacle jobs

function jobRow(j) {
  return {
    ref: j.ref, patient: j.patient, status: j.status, frame: j.frame || '', lens: j.lens_desc, lab: j.lab, rx: j.rx_ref,
    ordered: isoDate(j.ordered_on), promised: isoDate(j.promised_on), days_late: num(j.days_late), days_waiting: num(j.days_waiting),
    price_cents: num(j.price_cents), balance_cents: num(j.balance_cents), remake_reason: j.remake_reason || '',
  };
}

async function cmdJobs(db, flags) {
  const rows = await db.query(
    `select * from v_jobs ${flags.all ? '' : `where status in ('ordered', 'received', 'ready', 'remake')`} order by ordered_on`,
  );
  const result = rows.map(jobRow);
  if (out(flags, result)) return;
  console.log(heading(flags.all ? 'Every spectacle job' : 'Spectacle jobs in flight'));
  console.log(table(result, [
    { key: 'ref', label: 'job' }, { key: 'patient', label: 'patient' }, { key: 'status', label: 'status' },
    { key: 'lab', label: 'lab' }, { key: 'ordered', label: 'ordered' }, { key: 'promised', label: 'promised' },
    { key: 'days_late', label: 'late', align: 'right', format: (v) => (v ? `${v}d` : '') },
    { key: 'days_waiting', label: 'waiting', align: 'right', format: (v) => (v ? `${v}d` : '') },
    { key: 'balance_cents', label: 'owing', align: 'right', format: (v) => (v ? money(v) : '') },
    { key: 'frame', label: 'frame', width: 30 },
  ]));
}

async function cmdJobAdd(db, args, flags) {
  const patient = await resolvePatient(db, args.join(' '));
  let rx;
  if (flags.rx) rx = await resolveRx(db, flags.rx);
  else {
    [rx] = await db.query(`select * from v_prescriptions where patient_id = $1 and kind = 'spectacle' order by issued_on desc limit 1`, [patient.patient_id]);
    if (!rx) throw new CliError(`${patient.name} has no spectacle prescription on record. Examine first, or record the one they brought: rx add "${patient.name}" --right=... --left=...`);
  }
  if (rx.patient_id !== patient.patient_id) throw new CliError(`${rx.ref} belongs to ${rx.patient}, not ${patient.name}.`);
  if (rx.kind !== 'spectacle') throw new CliError(`${rx.ref} is a contact lens prescription. Spectacles are made to a spectacle prescription.`);
  if (rx.status === 'superseded') throw new CliError(`${rx.ref} has been superseded by a newer prescription. Order against the current one (rx "${patient.name}").`);
  if (rx.expired) throw new CliError(`${rx.ref} expired on ${isoDate(rx.expires_on)}. Spectacles are not made to an expired prescription: book an examination first.`);
  const lens = str(flags.lens);
  if (!lens) throw new CliError('What lenses? --lens="Progressive 1.6, anti-reflective"');
  const lab = str(flags.lab);
  if (!lab) throw new CliError('Which lab? --lab="..."');
  let frame = null;
  let frameDesc = null;
  if (flags.frame) {
    frame = await resolveStock(db, flags.frame);
    if (frame.kind !== 'frame') throw new CliError(`${frame.sku} is ${frame.kind.replace('_', ' ')}, not a frame.`);
    if (num(frame.on_hand) < 1) throw new CliError(`${frame.sku} (${frame.brand} ${frame.name}) shows none on hand. Receive it first (stock receive ${frame.sku} --qty=1) or pick another.`);
  } else if (flags['own-frame']) frameDesc = `Own frame: ${str(flags['own-frame'])}`;
  else throw new CliError('Which frame? --frame=SKU from stock, or --own-frame="description" if they brought their own.');
  const priceCents = cents(flags.price, 'price');
  if (priceCents === null) throw new CliError('What is the job worth? --price=649');
  const promised = parseDate(flags.promised) || addDays(today(), 7);
  const invoice = await newInvoice(db, {
    patientId: patient.patient_id, payer: 'patient', dueOn: promised,
    lines: [{ description: `Spectacles: ${frame ? `${frame.brand} ${frame.name}` : frameDesc.replace('Own frame: ', 'own frame, ')} with ${lens}`, unit_cents: priceCents }],
  });
  const ref = await mintRef(db, 'jobs', 'JOB', 3001);
  await db.query(
    `insert into jobs (ref, patient_id, rx_id, frame_id, frame_desc, lens_desc, lab, dispenser, promised_on, price_cents, invoice_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [ref, patient.patient_id, rx.id, frame?.id || null, frameDesc, lens, lab, str(flags.dispenser) || null, promised, priceCents, invoice.id],
  );
  await db.query(`update invoice_items set description = description || ' (' || $2 || ')' where invoice_id = $1`, [invoice.id, ref]);
  if (frame) await db.query('update stock set on_hand = on_hand - 1 where id = $1', [frame.id]);
  let balance = priceCents;
  const deposit = cents(flags.deposit, 'deposit');
  if (deposit) balance = await recordPayment(db, invoice.id, deposit, str(flags.method) || 'eftpos');
  const result = { ref, patient: patient.name, rx: rx.ref, lab, promised, invoice: invoice.ref, price_cents: priceCents, balance_cents: balance };
  if (out(flags, result)) return;
  console.log(`${ref} ordered for ${patient.name} to ${rx.ref} at ${lab}, promised ${promised}. ${invoice.ref}: ${money(priceCents)}, ${money(balance)} owing.`);
}

async function cmdJobMove(db, verb, args, flags) {
  const job = await resolveJob(db, args[0]);
  const from = {
    received: ['ordered', 'remake'], ready: ['ordered', 'remake', 'received'], collect: ['received', 'ready'],
    remake: ['ordered', 'received', 'ready', 'collected'], cancel: ['ordered', 'received', 'ready', 'remake'],
  }[verb];
  if (!from.includes(job.status)) throw new CliError(`${job.ref} is ${job.status}; it cannot be marked ${verb} from there.`);
  if (verb === 'received') await db.query(`update jobs set status = 'received', received_on = current_date where id = $1`, [job.id]);
  if (verb === 'ready') await db.query(`update jobs set status = 'ready', received_on = coalesce(received_on, current_date), notified_on = current_date where id = $1`, [job.id]);
  if (verb === 'collect') {
    const mustPay = (await setting(db, 'collect_requires_payment', 'true')) === 'true';
    if (mustPay && num(job.balance_cents) > 0) {
      const [inv] = await db.query('select ref from invoices where id = $1', [job.invoice_id]);
      throw new CliError(`${job.ref} has ${money(job.balance_cents)} owing. Take the payment first (pay ${inv.ref} --amount=${(num(job.balance_cents) / 100).toFixed(2)}), then hand the glasses over.`);
    }
    await db.query(`update jobs set status = 'collected', collected_on = current_date where id = $1`, [job.id]);
  }
  if (verb === 'remake') {
    const reason = str(flags.reason);
    if (!reason) throw new CliError('A remake needs a reason: --reason="..." (the lab, the frame, or the prescription).');
    const promised = parseDate(flags.promised) || addDays(today(), 7);
    await db.query(`update jobs set status = 'remake', remake_reason = $2, promised_on = $3, received_on = null, notified_on = null, collected_on = null where id = $1`, [job.id, reason, promised]);
  }
  if (verb === 'cancel') {
    const reason = str(flags.reason);
    if (!reason) throw new CliError('Cancelling a job needs a reason: --reason="..."');
    await db.query(`update jobs set status = 'cancelled', remake_reason = $2 where id = $1`, [job.id, reason]);
    const [j] = await db.query('select frame_id from jobs where id = $1', [job.id]);
    if (j.frame_id) await db.query('update stock set on_hand = on_hand + 1 where id = $1', [j.frame_id]);
  }
  const [after] = await db.query('select * from v_jobs where id = $1', [job.id]);
  if (out(flags, jobRow(after))) return;
  console.log(`${job.ref} (${job.patient}) is now ${after.status}.${verb === 'ready' ? ' Tell them: /draft-reminders writes the message; a person sends it.' : ''}`);
}

// ---------------------------------------------------------------------------
// Stock and counter sales

async function cmdStock(db, flags) {
  const where = [];
  const params = [];
  if (flags.kind) { params.push(str(flags.kind).replace('-', '_')); where.push(`kind = $${params.length}`); }
  if (flags.low) where.push('low');
  if (flags.aged) where.push(`kind = 'frame' and age_days > ${num(flags.aged === true ? 365 : flags.aged)} and moved_90 = 0 and on_hand > 0`);
  const rows = await db.query(`select * from v_stock where active ${where.length ? `and ${where.join(' and ')}` : ''} order by kind, brand, name`, params);
  const result = rows.map((r) => ({
    sku: r.sku, kind: r.kind, item: `${r.brand} ${r.name}`, colour: r.colour || '', on_hand: num(r.on_hand), reorder_at: num(r.reorder_at),
    moved_90: num(r.moved_90), age_days: num(r.age_days), retail_cents: num(r.retail_cents), value_cents: num(r.value_cents),
    flag: r.low ? 'REORDER' : r.kind === 'frame' && num(r.age_days) > 365 && num(r.moved_90) === 0 && num(r.on_hand) > 0 ? 'NOT MOVING' : '',
  }));
  if (out(flags, result)) return;
  console.log(heading('Stock'));
  console.log(table(result, [
    { key: 'sku', label: 'sku' }, { key: 'kind', label: 'kind' }, { key: 'item', label: 'item', width: 34 }, { key: 'on_hand', label: 'on hand', align: 'right' },
    { key: 'reorder_at', label: 'reorder at', align: 'right' }, { key: 'moved_90', label: 'moved 90d', align: 'right' }, { key: 'age_days', label: 'age', align: 'right', format: (v) => `${v}d` },
    { key: 'retail_cents', label: 'retail', align: 'right', format: (v) => price(v) }, { key: 'value_cents', label: 'at cost', align: 'right', format: (v) => money(v) }, { key: 'flag', label: '' },
  ]));
  const total = result.reduce((s, r) => s + r.value_cents, 0);
  console.log(`\n  ${money(total)} on the shelves at cost.`);
}

async function cmdStockAdd(db, args, flags) {
  const sku = args[0];
  if (!sku) throw new CliError('stock add SKU --kind=frame|contact-lens|solution|accessory --brand= --name= --cost= --retail= --qty= [--reorder=]');
  const kind = str(flags.kind || 'frame').replace('-', '_');
  if (!flags.brand || !flags.name) throw new CliError('A stock line needs --brand= and --name=.');
  await db.query(
    `insert into stock (sku, kind, brand, name, colour, size, cost_cents, retail_cents, on_hand, reorder_at, received_on) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, current_date)`,
    [sku.toUpperCase(), kind, str(flags.brand), str(flags.name), str(flags.colour) || null, str(flags.size) || null, cents(flags.cost) || 0, cents(flags.retail) || 0, num(flags.qty), num(flags.reorder)],
  );
  if (out(flags, { sku: sku.toUpperCase(), kind, on_hand: num(flags.qty) })) return;
  console.log(`${sku.toUpperCase()} added: ${flags.brand} ${flags.name}, ${num(flags.qty)} on hand.`);
}

async function cmdStockReceive(db, args, flags) {
  const item = await resolveStock(db, args.join(' '));
  const qty = num(flags.qty);
  if (qty <= 0) throw new CliError('How many came in? --qty=6');
  await db.query('update stock set on_hand = on_hand + $2, received_on = current_date where id = $1', [item.id, qty]);
  if (out(flags, { sku: item.sku, on_hand: num(item.on_hand) + qty })) return;
  console.log(`${item.sku}: ${qty} received, ${num(item.on_hand) + qty} on hand.`);
}

async function cmdSell(db, args, flags) {
  const item = await resolveStock(db, flags.item || args.pop());
  const patient = await resolvePatient(db, args.join(' '));
  const qty = num(flags.qty || 1);
  if (num(item.on_hand) < qty) throw new CliError(`${item.sku} has ${item.on_hand} on hand; ${qty} cannot be sold. Receive stock first.`);
  if (item.kind === 'contact_lens') {
    const [rx] = await db.query(
      `select * from v_prescriptions where patient_id = $1 and kind = 'contact_lens' and status = 'active' order by issued_on desc limit 1`,
      [patient.patient_id],
    );
    if (!rx) throw new CliError(`${patient.name} has no contact lens prescription on record. Contact lenses are not supplied without one: book a fitting.`);
    if (rx.expired) throw new CliError(`${patient.name}'s contact lens prescription ${rx.ref} expired on ${isoDate(rx.expires_on)}. Contact lenses are not supplied on an expired prescription: book an aftercare first (book add "${patient.name}" --service=CLAC ...).`);
  }
  const invoice = await newInvoice(db, { patientId: patient.patient_id, payer: 'patient', lines: [{ description: `${item.brand} ${item.name}`, qty, unit_cents: num(item.retail_cents), stock_id: item.id }] });
  await db.query('update stock set on_hand = on_hand - $2 where id = $1', [item.id, qty]);
  const total = qty * num(item.retail_cents);
  if (!flags.owing) await recordPayment(db, invoice.id, total, str(flags.method) || 'eftpos');
  const result = { invoice: invoice.ref, patient: patient.name, sku: item.sku, qty, total_cents: total, paid: !flags.owing, on_hand: num(item.on_hand) - qty };
  if (out(flags, result)) return;
  console.log(`${invoice.ref}: ${qty} x ${item.brand} ${item.name} to ${patient.name}, ${money(total)}${flags.owing ? ' owing' : ' paid'}. ${result.on_hand} left.`);
}

// ---------------------------------------------------------------------------
// Patients

async function cmdPatients(db, flags) {
  const rows = await db.query(`select * from v_patients where status = 'active' order by name`);
  const result = rows.map((r) => ({
    name: r.name, age: r.age, phone: r.phone || '', last_exam: isoDate(r.last_exam_on), next_appt: isoDate(r.next_appt_on),
    spend_24m_cents: num(r.spend_cents_24m), balance_cents: num(r.balance_cents),
    flags: [r.dva_number ? 'DVA' : '', r.diabetic ? 'diabetic' : '', r.conditions || ''].filter(Boolean).join(', '),
    marketing: r.marketing_opt_in === true ? 'yes' : r.marketing_opt_in === false ? 'no' : 'never asked',
  }));
  if (out(flags, result)) return;
  console.log(heading('The patient book'));
  console.log(table(result, [
    { key: 'name', label: 'patient' }, { key: 'age', label: 'age', align: 'right' }, { key: 'phone', label: 'phone' }, { key: 'last_exam', label: 'last exam' },
    { key: 'next_appt', label: 'next appt' }, { key: 'spend_24m_cents', label: 'spend 24m', align: 'right', format: (v) => money(v) },
    { key: 'balance_cents', label: 'owing', align: 'right', format: (v) => (v ? money(v) : '') }, { key: 'flags', label: 'flags', width: 30 }, { key: 'marketing', label: 'marketing' },
  ]));
}

async function cmdPatient(db, args, flags) {
  const p = await resolvePatient(db, args.join(' '), { includeArchived: true });
  const exams = await db.query(`select e.ref, e.on_date, e.mbs_item, e.status, o.name as optometrist, e.findings from exams e join optometrists o on o.id = e.optometrist_id where e.patient_id = $1 order by e.on_date desc limit 6`, [p.patient_id]);
  const rx = (await db.query(`select * from v_prescriptions where patient_id = $1 and status = 'active' order by issued_on desc`, [p.patient_id])).map(rxRow);
  const jobs = (await db.query(`select * from v_jobs where patient_id = $1 and status not in ('collected', 'cancelled')`, [p.patient_id])).map(jobRow);
  const recalls = await db.query(`select kind, due_on, status, contacts from recalls where patient_id = $1 and status in ('open', 'booked') order by due_on`, [p.patient_id]);
  const appts = await db.query(`select ref, on_date, starts_at, service, optometrist, status from v_appointments where patient_id = $1 and on_date >= current_date and status in ('booked', 'confirmed') order by on_date`, [p.patient_id]);
  const log = await db.query('select body, created_at from patient_notes where patient_id = $1 order by created_at desc limit 5', [p.patient_id]);
  const eligibility = await itemProblem(db, p, ageOn(p.date_of_birth, today()) >= 65 ? '10911' : '10910', today());
  if (out(flags, { patient: p, exams, prescriptions: rx, jobs, recalls, appointments: appts, log, medicare_comprehensive_claimable: !eligibility })) return;
  console.log(heading(`${p.name}${p.status === 'archived' ? ' (archived)' : ''}`));
  console.log(`  ${p.age ?? '?'} years, ${p.phone || 'no phone'}, ${p.email || 'no email'}. Medicare ${p.medicare_number || 'not recorded'}${p.health_fund ? `, ${p.health_fund} ${p.health_fund_no || ''}` : ''}${p.dva_number ? `, DVA ${p.dva_number} (no gap)` : ''}.`);
  if (p.diabetic || p.conditions) console.log(`  Clinical: ${[p.diabetic ? 'diabetic, dilate' : '', p.conditions || ''].filter(Boolean).join('; ')}`);
  console.log(`  Medicare comprehensive consult: ${eligibility ? `not claimable today (last ${p.last_comprehensive_item} on ${isoDate(p.last_comprehensive_on)})` : 'claimable today'}.`);
  console.log(`  Spend 24 months ${money(p.spend_cents_24m)}${num(p.balance_cents) ? `, OWES ${money(p.balance_cents)}` : ''}. Marketing: ${p.marketing_opt_in === true ? 'opted in' : p.marketing_opt_in === false ? 'said no' : 'never asked'}.`);
  for (const a of appts) console.log(`  Booked: ${a.ref} ${isoDate(a.on_date)} ${hhmm(a.starts_at)} ${a.service}${a.optometrist ? ` with ${a.optometrist}` : ''}`);
  for (const e of exams) console.log(`  Exam ${e.ref} ${isoDate(e.on_date)} ${e.mbs_item || 'private'} ${e.optometrist} ${e.status === 'final' ? '' : 'DRAFT '}${truncate(e.findings || '', 50)}`);
  for (const r of rx) console.log(`  ${r.ref} ${r.kind}: R ${r.right}  L ${r.left}, expires ${r.expires} (${r.state})`);
  for (const j of jobs) console.log(`  ${j.ref} ${j.status}${j.days_late ? `, ${j.days_late} days late` : ''}${j.balance_cents ? `, ${money(j.balance_cents)} owing` : ''}`);
  for (const r of recalls) console.log(`  Recall: ${r.kind} due ${isoDate(r.due_on)} (${r.status}, ${r.contacts} contacts)`);
  for (const l of log) console.log(`  Log ${String(l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at).slice(0, 10)}: ${l.body}`);
}

const PATIENT_FIELDS = { phone: 'phone', email: 'email', address: 'address', medicare: 'medicare_number', fund: 'health_fund', 'fund-no': 'health_fund_no', dva: 'dva_number', conditions: 'conditions', status: 'status' };

async function cmdPatientAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('patient add "Full Name" --dob=YYYY-MM-DD [--phone= --email= --medicare= --fund= --dva= --diabetic]');
  const dup = await db.query('select name from patients where lower(name) = lower($1)', [name]);
  if (dup.length) throw new CliError(`${name} is already on the book. Update them: patient set "${name}" ...`);
  const [row] = await db.query(
    `insert into patients (name, date_of_birth, phone, email, medicare_number, health_fund, health_fund_no, dva_number, diabetic, conditions, marketing_opt_in)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [name, parseDate(flags.dob, 'date of birth'), str(flags.phone) || null, str(flags.email) || null, str(flags.medicare) || null, str(flags.fund) || null,
      str(flags['fund-no']) || null, str(flags.dva) || null, Boolean(flags.diabetic), str(flags.conditions) || null,
      flags.marketing === undefined ? null : yesNo(flags.marketing)],
  );
  if (out(flags, { id: row.id, name })) return;
  console.log(`${name} added to the book.`);
}

async function cmdPatientSet(db, args, flags) {
  const p = await resolvePatient(db, args.join(' '), { includeArchived: true });
  const sets = [];
  const params = [p.patient_id];
  for (const [flag, col] of Object.entries(PATIENT_FIELDS)) {
    if (flags[flag] === undefined || flags[flag] === true) continue;
    params.push(str(flags[flag])); sets.push(`${col} = $${params.length}`);
  }
  if (flags.dob) { params.push(parseDate(flags.dob, 'date of birth')); sets.push(`date_of_birth = $${params.length}`); }
  if (flags.diabetic !== undefined) { params.push(flags.diabetic === true || yesNo(flags.diabetic)); sets.push(`diabetic = $${params.length}`); }
  if (flags.marketing !== undefined) { params.push(yesNo(flags.marketing)); sets.push(`marketing_opt_in = $${params.length}`); }
  if (!sets.length) throw new CliError('Nothing to change. Flags: --phone --email --dob --medicare --fund --fund-no --dva --diabetic --conditions --marketing=yes|no --status=active|archived');
  await db.query(`update patients set ${sets.join(', ')} where id = $1`, params);
  if (out(flags, { name: p.name, updated: sets.length })) return;
  console.log(`${p.name} updated.`);
}

async function cmdLog(db, args, flags) {
  const body = str(flags.text) || args.slice(1).join(' ');
  const p = await resolvePatient(db, args[0], { includeArchived: true });
  if (!body) throw new CliError('log "Patient" "what happened"');
  await db.query('insert into patient_notes (patient_id, body) values ($1, $2)', [p.patient_id, body]);
  if (out(flags, { patient: p.name, logged: body })) return;
  console.log(`Logged on ${p.name}'s card.`);
}

// ---------------------------------------------------------------------------
// Recalls

async function cmdRecalls(db, flags) {
  const horizon = num(flags.days || (await setting(db, 'recall_horizon_days', '14')));
  const rows = await db.query(`select * from v_recalls where due_on <= current_date + $1::int order by due_on`, [horizon]);
  const result = rows.map((r) => ({
    patient: r.patient, kind: r.kind, due: isoDate(r.due_on), days_overdue: num(r.days_overdue), contacts: num(r.contacts),
    last_contacted: isoDate(r.last_contacted_on), phone: r.phone || '', email: r.email || '', next_appt: isoDate(r.next_appt_on),
    can_message: Boolean(r.phone || r.email),
  }));
  if (out(flags, result)) return;
  console.log(heading(`Recalls due, or due inside ${horizon} days`));
  console.log(table(result, [
    { key: 'due', label: 'due' }, { key: 'days_overdue', label: 'overdue', align: 'right', format: (v) => (v > 0 ? `${v}d` : '') },
    { key: 'patient', label: 'patient' }, { key: 'kind', label: 'recall', width: 28 }, { key: 'contacts', label: 'contacts', align: 'right' },
    { key: 'last_contacted', label: 'last contact' }, { key: 'phone', label: 'phone' }, { key: 'next_appt', label: 'booked', format: (v) => v || '' },
  ]));
}

async function cmdRecallMove(db, verb, args, flags) {
  const p = await resolvePatient(db, args.join(' '));
  const [r] = await db.query(`select * from recalls where patient_id = $1 and status = 'open' order by due_on limit 1`, [p.patient_id]);
  if (!r && verb !== 'add') throw new CliError(`${p.name} has no open recall.`);
  let msg;
  if (verb === 'contacted') {
    const max = num(await setting(db, 'recall_max_contacts', '3'));
    const contacts = num(r.contacts) + 1;
    const status = contacts >= max && flags.final ? 'lapsed' : 'open';
    await db.query('update recalls set contacts = $2, last_contacted_on = current_date, status = $3 where id = $1', [r.id, contacts, status]);
    msg = `${p.name}: contact ${contacts} recorded${contacts >= max ? `. That is the ${max}th; if there is still no answer, close it: recall contacted "${p.name}" --final` : ''}.`;
  } else if (verb === 'done') {
    await db.query(`update recalls set status = 'done' where id = $1`, [r.id]);
    msg = `${p.name}'s ${r.kind} recall closed.`;
  } else {
    const due = parseDate(flags.due);
    if (!due) throw new CliError('recall add "Patient" --due=YYYY-MM-DD --kind="glaucoma review"');
    await db.query('insert into recalls (patient_id, kind, due_on) values ($1, $2, $3)', [p.patient_id, str(flags.kind) || 'eye examination', due]);
    msg = `Recall added for ${p.name}, due ${due}.`;
  }
  if (out(flags, { patient: p.name, message: msg })) return;
  console.log(msg);
}

// ---------------------------------------------------------------------------
// Claims

function claimRow(c) {
  return {
    ref: c.ref, funder: c.funder === 'fund' ? c.fund_name || 'fund' : c.funder, patient: c.patient, item: c.item, service_on: isoDate(c.service_on),
    amount_cents: num(c.amount_cents), status: c.status, days_lodged: c.days_lodged === null ? null : num(c.days_lodged),
    exam: c.exam_ref || '', exam_status: c.exam_status, blocked: c.status === 'ready' && c.exam_ref && c.exam_status !== 'final' ? `exam ${c.exam_status === 'none' ? 'missing' : 'in draft'}` : '',
    reject_reason: c.reject_reason || '',
  };
}

async function cmdClaims(db, flags) {
  const where = flags.ready ? `status = 'ready'` : flags.status ? `status = '${str(flags.status).replace(/[^a-z]/g, '')}'` : `status <> 'paid'`;
  const rows = await db.query(`select * from v_claims where ${where} order by status, service_on`);
  const result = rows.map(claimRow);
  if (out(flags, result)) return;
  console.log(heading('Claims not yet paid'));
  console.log(table(result, [
    { key: 'ref', label: 'claim' }, { key: 'funder', label: 'funder' }, { key: 'patient', label: 'patient' }, { key: 'item', label: 'item' },
    { key: 'service_on', label: 'service' }, { key: 'amount_cents', label: 'amount', align: 'right', format: (v) => price(v) }, { key: 'status', label: 'status' },
    { key: 'days_lodged', label: 'lodged', align: 'right', format: (v) => (v === null ? '' : `${v}d ago`) }, { key: 'blocked', label: 'blocked by' },
  ]));
  const ready = result.filter((r) => r.status === 'ready' && !r.blocked);
  const blocked = result.filter((r) => r.blocked);
  if (ready.length || blocked.length) console.log(`\n  ${ready.length} ready to lodge (${price(ready.reduce((s, r) => s + r.amount_cents, 0))}); ${blocked.length} waiting on an examination. Lodge them: claim lodge --ready`);
  for (const r of result.filter((x) => x.status === 'rejected')) console.log(`  ${r.ref} rejected: "${r.reject_reason}"`);
}

async function cmdClaimLodge(db, args, flags) {
  const targets = flags.ready || args[0] === '--ready' || !args.length
    ? await db.query(`select * from v_claims where status = 'ready' order by service_on`)
    : [await resolveClaim(db, args[0])];
  const lodged = [];
  const held = [];
  for (const c of targets) {
    if (!['ready', 'rejected'].includes(c.status)) { held.push({ ref: c.ref, why: `it is ${c.status}` }); continue; }
    if (c.exam_ref && c.exam_status !== 'final') { held.push({ ref: c.ref, why: `${c.patient}'s examination ${c.exam_ref} is ${c.exam_status === 'draft' ? 'still in draft' : 'missing'}` }); continue; }
    if (c.status === 'rejected' && !flags.fixed) { held.push({ ref: c.ref, why: `it was rejected ("${c.reject_reason}"). Fix the cause, then: claim lodge ${c.ref} --fixed="what changed"` }); continue; }
    if (flags.item) await db.query('update claims set item = $2 where id = $1', [c.id, str(flags.item)]);
    await db.query(`update claims set status = 'lodged', lodged_on = current_date, reject_reason = null where id = $1`, [c.id]);
    lodged.push({ ref: c.ref, funder: c.funder, patient: c.patient, amount_cents: num(c.amount_cents) });
  }
  if (!targets.length) throw new CliError('Nothing is ready to lodge.');
  const result = { lodged, held };
  if (out(flags, result)) return;
  console.log(`Lodged ${lodged.length} claim(s), ${price(lodged.reduce((s, c) => s + c.amount_cents, 0))}. Record them as lodged only once they have gone through Medicare Online, DVA or HICAPS.`);
  for (const h of held) console.log(`  Held back ${h.ref}: ${h.why}.`);
}

async function cmdClaimPaid(db, args, flags) {
  const c = await resolveClaim(db, args[0]);
  if (c.status !== 'lodged') throw new CliError(`${c.ref} is ${c.status}; only a lodged claim can be paid.`);
  const amount = flags.amount ? cents(flags.amount) : num(c.amount_cents);
  await db.query(`update claims set status = 'paid', paid_on = current_date, paid_cents = $2 where id = $1`, [c.id, amount]);
  const [inv] = await db.query('select id, balance_cents from v_invoices where id = (select invoice_id from claims where id = $1)', [c.id]);
  if (inv && num(inv.balance_cents) > 0) await recordPayment(db, inv.id, Math.min(amount, num(inv.balance_cents)), c.funder);
  const short = num(c.amount_cents) - amount;
  if (out(flags, { ref: c.ref, paid_cents: amount, short_cents: short })) return;
  console.log(`${c.ref} paid: ${price(amount)}${short > 0 ? `, ${price(short)} short of the claim. Find out why before it is forgotten.` : '.'}`);
}

async function cmdClaimReject(db, args, flags) {
  const c = await resolveClaim(db, args[0]);
  const reason = str(flags.reason);
  if (!reason) throw new CliError('Record the funder\'s reason word for word: --reason="..."');
  await db.query(`update claims set status = 'rejected', reject_reason = $2 where id = $1`, [c.id, reason]);
  if (out(flags, { ref: c.ref, status: 'rejected', reason })) return;
  console.log(`${c.ref} recorded as rejected: "${reason}".`);
}

// ---------------------------------------------------------------------------
// Money

async function cmdInvoices(db, flags) {
  const rows = await db.query(`select * from v_invoices where ${flags.all ? 'true' : `status = 'sent' and balance_cents > 0`} order by issued_on desc`);
  const result = rows.map((r) => ({ ref: r.ref, patient: r.patient, payer: r.payer, issued: isoDate(r.issued_on), due: isoDate(r.due_on), total_cents: num(r.total_cents), balance_cents: num(r.balance_cents), days_overdue: num(r.days_overdue), status: r.status }));
  if (out(flags, result)) return;
  console.log(heading(flags.all ? 'Invoices' : 'Invoices with money owing'));
  console.log(table(result, [
    { key: 'ref', label: 'invoice' }, { key: 'patient', label: 'patient' }, { key: 'payer', label: 'payer' }, { key: 'issued', label: 'issued' }, { key: 'due', label: 'due' },
    { key: 'total_cents', label: 'total', align: 'right', format: (v) => price(v) }, { key: 'balance_cents', label: 'owing', align: 'right', format: (v) => price(v) },
    { key: 'days_overdue', label: 'overdue', align: 'right', format: (v) => (v ? `${v}d` : '') },
  ]));
}

async function cmdDebtors(db, flags) {
  const rows = await db.query(
    `select payer, count(*) as invoices, sum(balance_cents) as owing,
            sum(case when days_overdue > 30 then balance_cents else 0 end) as over_30
     from v_invoices where status = 'sent' and balance_cents > 0 group by payer order by owing desc`,
  );
  const result = rows.map((r) => ({ payer: r.payer, invoices: num(r.invoices), owing_cents: num(r.owing), over_30_cents: num(r.over_30) }));
  if (out(flags, result)) return;
  console.log(heading('Who owes the practice'));
  console.log(table(result, [
    { key: 'payer', label: 'payer' }, { key: 'invoices', label: 'invoices', align: 'right' },
    { key: 'owing_cents', label: 'owing', align: 'right', format: (v) => price(v) }, { key: 'over_30_cents', label: 'over 30 days', align: 'right', format: (v) => price(v) },
  ]));
}

async function cmdPay(db, args, flags) {
  const inv = await resolveInvoice(db, args[0]);
  const amount = flags.amount ? cents(flags.amount) : num(inv.balance_cents);
  const left = await recordPayment(db, inv.id, amount, str(flags.method) || 'eftpos');
  if (out(flags, { ref: inv.ref, paid_cents: amount, balance_cents: left })) return;
  console.log(`${inv.ref}: ${price(amount)} received, ${left ? `${price(left)} still owing` : 'paid in full'}.`);
}

async function cmdTakings(db, flags) {
  const days = num(flags.days || 30);
  const rows = await db.query(
    `select line, sum(takings_cents) as takings from v_takings where on_date > current_date - $1::int and on_date <= current_date group by line order by takings desc`,
    [days],
  );
  const byOpt = await db.query(
    `select o.name as optometrist, count(*) as consults, sum(case when e.mbs_item is not null then 1 else 0 end) as medicare
     from exams e join optometrists o on o.id = e.optometrist_id
     where e.on_date > current_date - $1::int and e.on_date <= current_date and not e.imported group by o.name order by o.name`,
    [days],
  );
  const result = { days, lines: rows.map((r) => ({ line: r.line, takings_cents: num(r.takings) })), consults: byOpt.map((r) => ({ optometrist: r.optometrist, consults: num(r.consults), medicare: num(r.medicare) })) };
  if (out(flags, result)) return;
  console.log(heading(`Takings, last ${days} days (invoiced)`));
  console.log(table(result.lines, [{ key: 'line', label: 'line' }, { key: 'takings_cents', label: 'invoiced', align: 'right', format: (v) => money(v) }]));
  console.log(table(result.consults, [{ key: 'optometrist', label: 'optometrist' }, { key: 'consults', label: 'consults', align: 'right' }, { key: 'medicare', label: 'Medicare items', align: 'right' }]));
}

async function cmdCapture(db, flags) {
  const days = num(flags.days || 90);
  const rows = await db.query(
    `select optometrist, count(*) filter (where new_spec_rx) as new_rx, count(*) filter (where new_spec_rx and bought) as bought
     from v_capture where on_date > current_date - $1::int and on_date <= current_date - 0 group by optometrist order by optometrist`,
    [days],
  );
  const walked = await db.query(
    `select c.patient, c.ref, c.on_date, c.optometrist, vp.phone, vp.marketing_opt_in from v_capture c join v_patients vp on vp.patient_id = c.patient_id
     where c.new_spec_rx and not c.bought and c.on_date > current_date - $1::int order by c.on_date desc`,
    [days],
  );
  const result = {
    days,
    by_optometrist: rows.map((r) => ({ optometrist: r.optometrist, new_rx: num(r.new_rx), bought: num(r.bought), capture_pct: num(r.new_rx) ? Math.round((num(r.bought) / num(r.new_rx)) * 100) : null })),
    walked_out: walked.map((w) => ({ patient: w.patient, exam: w.ref, on: isoDate(w.on_date), optometrist: w.optometrist, phone: w.phone || '', opt_in: w.marketing_opt_in })),
  };
  if (out(flags, result)) return;
  console.log(heading(`Capture: new spectacle prescriptions that became a job here, last ${days} days`));
  console.log(table(result.by_optometrist, [
    { key: 'optometrist', label: 'optometrist' }, { key: 'new_rx', label: 'new Rx', align: 'right' }, { key: 'bought', label: 'bought here', align: 'right' },
    { key: 'capture_pct', label: 'capture', align: 'right', format: (v) => (v === null ? '' : `${v}%`) },
  ]));
  console.log('\n  Walked out with a new prescription and no order:');
  console.log(table(result.walked_out, [{ key: 'on', label: 'exam' }, { key: 'patient', label: 'patient' }, { key: 'optometrist', label: 'optometrist' }, { key: 'phone', label: 'phone' }]));
}

async function cmdTeam(db, flags) {
  const rows = await db.query(`select * from optometrists where status = 'active' order by name`);
  const result = rows.map((r) => ({ name: r.name, provider_number: r.provider_number || '', registration: r.registration_no || '', therapeutic: r.therapeutic, days: r.days, hours: `${hhmm(r.starts_at)} to ${hhmm(r.ends_at)}` }));
  if (out(flags, result)) return;
  console.log(heading('The optometrists'));
  console.log(table(result, [
    { key: 'name', label: 'optometrist' }, { key: 'provider_number', label: 'provider no.' }, { key: 'registration', label: 'registration' },
    { key: 'therapeutic', label: 'therapeutic', format: (v) => (v ? 'yes' : '') }, { key: 'days', label: 'days' }, { key: 'hours', label: 'hours' },
  ]));
}

async function cmdOptometristAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('optometrist add "Name" --provider= --registration= [--days=mon,tue,wed --from=09:00 --to=17:30 --therapeutic]');
  await db.query(
    `insert into optometrists (name, provider_number, registration_no, therapeutic, days, starts_at, ends_at) values ($1, $2, $3, $4, $5, $6, $7)`,
    [name, str(flags.provider) || null, str(flags.registration) || null, Boolean(flags.therapeutic), str(flags.days) || 'mon,tue,wed,thu,fri', parseTime(flags.from) || '09:00', parseTime(flags.to) || '17:30'],
  );
  if (out(flags, { name })) return;
  console.log(`${name} added to the team.`);
}

async function cmdServices(db, flags) {
  const rows = await db.query('select * from services where active order by kind, code');
  const result = rows.map((r) => ({ code: r.code, name: r.name, kind: r.kind, minutes: num(r.minutes), fee_cents: num(r.fee_cents), mbs_item: r.mbs_item || '' }));
  if (out(flags, result)) return;
  console.log(heading('Services'));
  console.log(table(result, [
    { key: 'code', label: 'code' }, { key: 'name', label: 'service' }, { key: 'kind', label: 'kind' }, { key: 'minutes', label: 'min', align: 'right' },
    { key: 'fee_cents', label: 'fee', align: 'right', format: (v) => price(v) }, { key: 'mbs_item', label: 'MBS item' },
  ]));
}

// ---------------------------------------------------------------------------
// Attention: everything that wants a decision, worst first

async function cmdAttention(db, flags) {
  const rows = [];
  const examDueDays = num(await setting(db, 'exam_due_days', '2'));
  const rxWarn = num(await setting(db, 'rx_warn_days', '45'));
  const readyWarn = num(await setting(db, 'job_ready_warn_days', '14'));
  const queryDays = num(await setting(db, 'claim_query_days', '21'));
  const horizon = num(await setting(db, 'recall_horizon_days', '14'));

  // [1] The clinical record. A consult with no final examination cannot be
  // claimed and cannot be defended.
  for (const r of await db.query('select * from v_exams_due order by on_date')) {
    rows.push({
      rank: 1, reason: r.exam_state === 'missing' ? 'exam_missing' : 'exam_draft', who: r.patient, ref: r.exam_ref || r.ref,
      detail: `${r.patient}'s ${r.service} with ${r.optometrist} on ${isoDate(r.on_date)} has ${r.exam_state === 'missing' ? 'no examination on record at all' : `an examination still in draft (${r.exam_ref})`}${num(r.days_since) > examDueDays ? `, ${r.days_since} days on` : ''}. Write it now: exam record ${r.exam_ref || r.ref} --findings="..." --management="..." then exam final ${r.exam_ref || r.ref}`,
    });
  }

  // [1] A booking that will bill an item Medicare will not pay.
  for (const a of await db.query(
    `select * from v_appointments where status in ('booked', 'confirmed') and on_date between current_date and current_date + 14 and mbs_item in ('10910', '10911') order by on_date, starts_at`,
  )) {
    const [p] = await db.query('select * from v_patients where patient_id = $1', [a.patient_id]);
    const problem = await itemProblem(db, p, a.mbs_item, isoDate(a.on_date));
    if (problem) {
      rows.push({
        rank: 1, reason: 'item_not_claimable', who: a.patient, ref: a.ref,
        detail: `${a.patient} is booked ${isoDate(a.on_date)} ${hhmm(a.starts_at)} (${a.ref}) as a ${a.mbs_item}, and Medicare will not pay it: ${problem.split('. ')[0]}. Decide before they arrive: 10913 with the reason for the visit written down (their booking says "${a.reason || 'no reason given'}"), or a private fee they know about in advance.`,
      });
    }
  }

  // [2] Claims the funder sent back.
  for (const c of await db.query(`select * from v_claims where status = 'rejected' order by service_on`)) {
    rows.push({ rank: 2, reason: 'claim_rejected', who: c.patient, ref: c.ref, detail: `${c.funder.toUpperCase()} rejected ${c.ref} (${c.patient}, item ${c.item}, ${isoDate(c.service_on)}, ${price(c.amount_cents)}): "${c.reject_reason}". Rebill it correctly (a 10913 with the reason, or privately) and record what changed: claim lodge ${c.ref} --fixed="..." --item=...` });
  }

  // [2] Ready claims an unfinished examination is holding back.
  for (const c of await db.query(`select * from v_claims where status = 'ready' and exam_ref is not null and exam_status <> 'final'`)) {
    rows.push({ rank: 2, reason: 'claim_blocked', who: c.patient, ref: c.ref, detail: `${c.ref} (${c.funder.toUpperCase()}, ${price(c.amount_cents)}) cannot lodge: ${c.patient}'s examination ${c.exam_ref} is ${c.exam_status === 'draft' ? 'still in draft' : 'missing'}. Finalise it, then: claim lodge ${c.ref}` });
  }

  // [2] A contact lens wearer whose prescription has run out.
  for (const r of await db.query(
    `select r.* from v_prescriptions r
     where r.kind = 'contact_lens' and r.status = 'active' and r.expired
       and exists (select 1 from invoice_items ii join invoices i on i.id = ii.invoice_id join stock s on s.id = ii.stock_id
                   where i.patient_id = r.patient_id and s.kind = 'contact_lens' and i.issued_on > current_date - 365)`,
  )) {
    const [appt] = await db.query(`select ref, on_date from appointments where patient_id = $1 and status in ('booked', 'confirmed') and on_date >= current_date order by on_date limit 1`, [r.patient_id]);
    if (appt) continue;
    rows.push({ rank: 2, reason: 'cl_rx_expired', who: r.patient, ref: r.ref, detail: `${r.patient} buys contact lenses here and ${r.ref} expired ${-num(r.days_to_expiry)} days ago, with no aftercare booked. The next box cannot be sold until they are seen: call ${r.phone || '(no phone)'} and book a CLAC.` });
  }

  // [3] Money sitting in a drawer.
  const ready = await db.query(`select * from v_claims where status = 'ready' and (exam_ref is null or exam_status = 'final') order by service_on`);
  if (ready.length) {
    const total = ready.reduce((s, c) => s + num(c.amount_cents), 0);
    rows.push({ rank: 3, reason: 'claims_ready', who: 'Medicare / DVA', ref: '', detail: `${ready.length} claim(s) worth ${price(total)} are ready and not lodged, the oldest ${Math.max(...ready.map((c) => num(c.days_since_service)))} days after the consult (${[...new Set(ready.map((c) => c.patient))].join(', ')}). Lodge them: claim lodge --ready` });
  }

  // [3] Glasses the lab promised and has not delivered.
  for (const j of await db.query(`select * from v_jobs where days_late > 0 order by days_late desc`)) {
    rows.push({ rank: 3, reason: 'job_late', who: j.patient, ref: j.ref, detail: `${j.ref} for ${j.patient} (${j.lens_desc}) was promised by ${j.lab} on ${isoDate(j.promised_on)} and is ${j.days_late} day(s) late${j.status === 'remake' ? ' on a remake' : ''}. Chase the lab, then tell the patient before they ring you.` });
  }

  // [4] Finished glasses nobody has collected.
  for (const j of await db.query(`select * from v_jobs where status in ('received', 'ready') and days_waiting >= $1 order by days_waiting desc`, [readyWarn])) {
    rows.push({ rank: 4, reason: 'job_uncollected', who: j.patient, ref: j.ref, detail: `${j.patient}'s glasses (${j.ref}) have waited ${j.days_waiting} days${j.notified_on ? `, told on ${isoDate(j.notified_on)}` : ', and nobody has told them'}${num(j.balance_cents) ? `, with ${money(j.balance_cents)} owing` : ''}. Call ${j.phone || '(no phone)'}; a job left for months is a refund argument later.` });
  }

  // [4] Funders sitting on money.
  for (const c of await db.query(`select * from v_claims where status = 'lodged' and days_lodged > $1 order by days_lodged desc`, [queryDays])) {
    rows.push({ rank: 4, reason: 'claim_unpaid', who: c.patient, ref: c.ref, detail: `${c.funder.toUpperCase()} has had ${c.ref} (${c.patient}, ${price(c.amount_cents)}) for ${c.days_lodged} days without paying. Check the remittance and query it.` });
  }

  // [5] Recalls overdue with nothing booked.
  for (const r of await db.query(`select * from v_recalls where due_on < current_date and next_appt_on is null order by due_on`)) {
    const how = r.phone || r.email ? (r.marketing_opt_in ? 'a recall message is ready to draft (/draft-recall)' : `it is a phone call: ${r.phone || r.email}`) : 'there is no way to reach them on file';
    rows.push({ rank: 5, reason: 'recall_overdue', who: r.patient, ref: '', detail: `${r.patient}'s ${r.kind} was due ${isoDate(r.due_on)}, ${r.days_overdue} days ago, after ${r.contacts} contact(s), and nothing is booked; ${how}.` });
  }

  // [5] Prescriptions about to lapse with nothing booked.
  for (const r of await db.query(
    `select r.* from v_prescriptions r join v_patients vp on vp.patient_id = r.patient_id
     where r.kind = 'spectacle' and r.status = 'active' and not r.expired and r.days_to_expiry <= $1 and vp.next_appt_on is null and vp.status = 'active' order by r.expires_on`,
    [rxWarn],
  )) {
    rows.push({ rank: 5, reason: 'rx_expiring', who: r.patient, ref: r.ref, detail: `${r.patient}'s spectacle prescription ${r.ref} expires ${isoDate(r.expires_on)} (${r.days_to_expiry} days) and nothing is booked. Book the examination before it lapses.` });
  }

  // [6] Tomorrow's unconfirmed bookings.
  for (const a of await db.query(`select * from v_appointments where status = 'booked' and on_date = current_date + 1 order by starts_at`)) {
    rows.push({ rank: 6, reason: 'unconfirmed', who: a.patient, ref: a.ref, detail: `${a.patient} is booked tomorrow ${hhmm(a.starts_at)} (${a.ref}) and has not confirmed. Remind them (/draft-reminders), then: confirm ${a.ref}` });
  }

  // [6] Stock.
  for (const s of await db.query(`select * from v_stock where active and low order by kind, sku`)) {
    rows.push({ rank: 6, reason: 'stock_low', who: `${s.brand} ${s.name}`, ref: s.sku, detail: `${s.sku} (${s.brand} ${s.name}) is down to ${s.on_hand}, reorder point ${s.reorder_at}. Order more, then: stock receive ${s.sku} --qty=N` });
  }
  for (const s of await db.query(`select * from v_stock where active and kind = 'frame' and on_hand > 0 and age_days > 365 and moved_90 = 0 order by value_cents desc`)) {
    rows.push({ rank: 7, reason: 'stock_not_moving', who: `${s.brand} ${s.name}`, ref: s.sku, detail: `${s.on_hand} x ${s.sku} (${s.brand} ${s.name}) have sat ${s.age_days} days with none sold in 90: ${money(s.value_cents)} at cost on the wall. Return them to the supplier, or price them to go.` });
  }

  // [7] Recalls falling due soon.
  for (const r of await db.query(`select * from v_recalls where due_on between current_date and current_date + $1::int and next_appt_on is null order by due_on`, [horizon])) {
    rows.push({ rank: 7, reason: 'recall_due_soon', who: r.patient, ref: '', detail: `${r.patient}'s ${r.kind} falls due ${isoDate(r.due_on)}. Book it now while the diary has room.` });
  }

  rows.sort((a, b) => a.rank - b.rank);
  if (out(flags, rows)) return;
  console.log(heading('Needs a decision, worst first'));
  if (!rows.length) { console.log('  Nothing. The record is clean.'); return; }
  for (const r of rows) console.log(`\n  [${r.rank}] ${r.reason}  ${r.who}${r.ref ? `  ${r.ref}` : ''}\n      ${r.detail}`);
}

// ---------------------------------------------------------------------------
// Compliance: the rule book run against the records

async function cmdCompliance(db, args, flags) {
  const examDueDays = num(await setting(db, 'exam_due_days', '2'));
  const checks = [];

  const late = await db.query(`select * from v_exams_due where days_since > $1`, [examDueDays]);
  checks.push({
    rule: 'records', name: 'Every consult has a finalised examination record',
    source: 'Optometry Board of Australia, Code of conduct (health records); Health Records Act 2001 (Vic), Health Privacy Principle 4; docs/compliance.md',
    ok: late.length === 0,
    found: late.length ? `${late.length} consult(s) past the ${examDueDays}-day line: ${late.map((r) => `${r.exam_ref || r.ref} (${r.patient}, ${r.exam_state})`).join(', ')}` : 'every consult is recorded and final inside the window',
  });

  // The interval rules, checked over every billed comprehensive item.
  const billed = await db.query(
    `select e.id, e.ref, e.on_date, e.mbs_item, e.item_reason, e.dilated, e.status, p.id as patient_id, p.name, p.date_of_birth, p.diabetic
     from exams e join patients p on p.id = e.patient_id
     where e.billing in ('bulk', 'dva') and not e.imported and e.mbs_item is not null and e.on_date > current_date - 1095 order by e.on_date`,
  );
  const itemBreaches = [];
  for (const e of billed) {
    const problem = await itemProblem(db, { ...e, patient_id: e.patient_id }, e.mbs_item, isoDate(e.on_date), { reason: e.item_reason, excludeExamId: e.id });
    if (problem) itemBreaches.push(`${e.ref} (${e.name}, ${e.mbs_item} on ${isoDate(e.on_date)})`);
    if (e.mbs_item === '10915' && e.status === 'final' && !e.dilated) itemBreaches.push(`${e.ref} (${e.name}, 10915 without dilation recorded)`);
  }
  checks.push({
    rule: 'medicare-items', name: 'Comprehensive items billed inside their rules',
    source: 'Medicare Benefits Schedule, optometry items 10910 (under 65, once in 36 months), 10911 (65 and over, once in 12 months), 10913, 10914, 10915; MBS Online; docs/compliance.md',
    ok: itemBreaches.length === 0,
    found: itemBreaches.length ? `${itemBreaches.length} consult(s) billed outside the rules on this record: ${itemBreaches.join(', ')}` : 'every billed item fits its age, interval and reason rules on this record',
  });

  const unfinalisedLodged = await db.query(`select * from v_claims where status in ('lodged', 'paid') and exam_ref is not null and exam_status <> 'final'`);
  checks.push({
    rule: 'claims', name: 'No claim lodged ahead of its examination record',
    source: 'Medicare Benefits Schedule, general explanatory notes (records to substantiate a service); docs/compliance.md',
    ok: unfinalisedLodged.length === 0,
    found: unfinalisedLodged.length ? unfinalisedLodged.map((c) => c.ref).join(', ') : 'every lodged claim has a finalised examination',
  });

  const dvaGap = await db.query(
    `select i.ref, p.name from invoices i join patients p on p.id = i.patient_id join invoice_items ii on ii.invoice_id = i.id
     where p.dva_number is not null and i.payer = 'patient' and ii.mbs_item is not null and i.status <> 'void'`,
  );
  checks.push({
    rule: 'dva-no-gap', name: 'DVA card holders never billed for a consult',
    source: 'Department of Veterans\' Affairs, Notes for Optometrists (the DVA fee is payment in full; no charge to the entitled person); docs/compliance.md',
    ok: dvaGap.length === 0,
    found: dvaGap.length ? dvaGap.map((r) => `${r.ref} (${r.name})`).join(', ') : 'no consult has been billed to a DVA card holder',
  });

  const shortRx = await db.query(`select ref, patient, issued_on, expires_on from v_prescriptions where (expires_on - issued_on) < 90`);
  checks.push({
    rule: 'rx-expiry', name: 'Every prescription carries a reasonable expiry date',
    source: 'Optometry Board of Australia, Guidelines: prescription of optical appliances (issue and expiry dates; not unreasonably short); docs/compliance.md',
    ok: shortRx.length === 0,
    found: shortRx.length ? shortRx.map((r) => `${r.ref} (${r.patient}, ${daysBetween(isoDate(r.issued_on), isoDate(r.expires_on))} days)`).join(', ') : 'every prescription has an issue and an expiry date at least 90 days apart',
  });

  const badJobs = await db.query(
    `select j.ref, p.name from jobs j join prescriptions r on r.id = j.rx_id join patients p on p.id = j.patient_id
     where j.status <> 'cancelled' and (j.ordered_on > r.expires_on or j.ordered_on < r.issued_on)`,
  );
  const badCl = await db.query(
    `select i.ref, p.name from invoices i join invoice_items ii on ii.invoice_id = i.id join stock s on s.id = ii.stock_id join patients p on p.id = i.patient_id
     where s.kind = 'contact_lens' and i.status <> 'void'
       and not exists (select 1 from prescriptions r where r.patient_id = i.patient_id and r.kind = 'contact_lens' and i.issued_on between r.issued_on and r.expires_on)`,
  );
  checks.push({
    rule: 'supply', name: 'Spectacles and contact lenses supplied only on a current prescription',
    source: 'Optometry Board of Australia, Guidelines: prescription of optical appliances; state and territory law on supplying contact lenses without a prescription; docs/compliance.md',
    ok: badJobs.length === 0 && badCl.length === 0,
    found: badJobs.length || badCl.length ? [...badJobs.map((j) => `${j.ref} (${j.name})`), ...badCl.map((c) => `${c.ref} (${c.name}, contact lenses)`)].join(', ') : 'every job and contact lens sale sits inside a current prescription',
  });

  const noDob = await db.query(`select name from patients p where status = 'active' and date_of_birth is null and exists (select 1 from appointments a where a.patient_id = p.id and a.status in ('booked', 'confirmed'))`);
  checks.push({
    rule: 'identity', name: 'Booked patients carry the date of birth Medicare checks',
    source: 'Services Australia, Medicare claiming (patient identification); docs/compliance.md',
    ok: noDob.length === 0,
    found: noDob.length ? noDob.map((r) => r.name).join(', ') : 'every booked patient has a date of birth',
  });

  const breached = checks.filter((c) => !c.ok).length;
  if (out(flags, { checks, breached })) return;
  console.log(heading('The rule book against the records'));
  for (const c of checks) console.log(`\n  ${c.ok ? 'OK    ' : 'BREACH'}  ${c.name}\n          ${c.found}\n          Source: ${c.source}`);
  console.log(`\n  ${breached ? `${breached} rule(s) breached.` : 'Every rule holds.'} Nothing here is legal advice: docs/compliance.md lists the rules the practice has told the system to enforce.`);
}

async function cmdSettings(db, args, flags) {
  if ((args[0] || '').toLowerCase() === 'set') {
    const [, key, ...rest] = args;
    const value = rest.join(' ');
    const [row] = await db.query('select key from settings where key = $1', [key]);
    if (!row) throw new CliError(`No setting "${key}". See: settings`);
    await db.query('update settings set value = $2 where key = $1', [key, value]);
    if (out(flags, { key, value })) return;
    console.log(`${key} = ${value}`);
    return;
  }
  const rows = await db.query('select key, value, note from settings order by key');
  if (out(flags, rows)) return;
  console.log(heading('Settings'));
  console.log(table(rows, [{ key: 'key', label: 'setting' }, { key: 'value', label: 'value' }, { key: 'note', label: 'what it does', width: 80 }]));
}

// ---------------------------------------------------------------------------
// Import from Optomate, export to CSV

async function cmdImport(db, args, flags) {
  const source = (args[0] || 'optomate').toLowerCase();
  const patientsFile = str(flags.patients);
  const rxFile = str(flags.prescriptions);
  if (!patientsFile && !rxFile) {
    throw new CliError(`import ${source} --patients=Patients.csv [--prescriptions=Prescriptions.csv] [--dry-run]\nRun a patient list report in Optomate (with last consult, last item and recall columns) and save it as CSV. docs/replace-optomate.md has the steps.`);
  }
  const dryRun = Boolean(flags['dry-run']);
  const created = [];
  const updated = [];
  const skipped = [];
  const key = (name, dob) => `${name.toLowerCase()}|${dob || ''}`;
  const ids = new Map();
  for (const r of await db.query('select id, name, date_of_birth from patients')) {
    ids.set(key(r.name, isoDate(r.date_of_birth)), r.id);
    if (!ids.has(key(r.name, ''))) ids.set(key(r.name, ''), r.id);
  }
  const optom = new Map();
  for (const r of await db.query(`select id, name from optometrists where status = 'active'`)) optom.set(r.name.toLowerCase(), r.id);
  const [firstOptom] = await db.query(`select id from optometrists where status = 'active' order by created_at limit 1`);
  const find = (name, dob) => ids.get(key(name, dob)) || ids.get(key(name, ''));

  if (patientsFile) {
    if (!existsSync(patientsFile)) throw new CliError(`No file at ${patientsFile}.`);
    for (const row of parseCsv(readFileSync(patientsFile, 'utf8'))) {
      const first = pick(row, 'given name', 'first name', 'firstname', 'given names');
      const last = pick(row, 'surname', 'last name', 'lastname', 'family name');
      const name = (first || last ? `${first || ''} ${last || ''}` : pick(row, 'patient name', 'patient', 'name', 'full name') || '').trim().replace(/\s+/g, ' ');
      if (!name) { skipped.push({ what: 'patient', why: 'row with no name' }); continue; }
      let dob = null;
      const dobRaw = pick(row, 'date of birth', 'dob', 'birth date', 'birthdate');
      if (dobRaw) { try { dob = parseDate(dobRaw, 'date of birth'); } catch { skipped.push({ what: 'patient', why: `${name}: unreadable date of birth "${dobRaw}" (kept the rest)` }); } }
      const fields = {
        phone: pick(row, 'mobile', 'mobile phone', 'phone (mobile)', 'phone', 'home phone') || null,
        email: pick(row, 'email', 'email address') || null,
        address: [pick(row, 'address', 'address 1', 'street'), pick(row, 'suburb', 'city'), pick(row, 'state'), pick(row, 'postcode', 'post code')].filter(Boolean).join(', ') || null,
        medicare: (pick(row, 'medicare no', 'medicare number', 'medicare', 'medicare card') || '').trim() || null,
        fund: pick(row, 'health fund', 'fund', 'health fund name') || null,
        fundNo: pick(row, 'health fund no', 'fund no', 'health fund number', 'fund number', 'membership no') || null,
        dva: pick(row, 'dva no', 'dva number', 'dva') || null,
        diabetic: /diab/i.test(pick(row, 'diabetic', 'diabetes', 'conditions', 'medical conditions') || ''),
      };
      let id = find(name, dob);
      if (id) {
        if (!dryRun) {
          await db.query(
            `update patients set phone = coalesce(phone, $2), email = coalesce(email, $3), address = coalesce(address, $4), medicare_number = coalesce(medicare_number, $5),
               health_fund = coalesce(health_fund, $6), health_fund_no = coalesce(health_fund_no, $7), dva_number = coalesce(dva_number, $8),
               date_of_birth = coalesce(date_of_birth, $9), diabetic = diabetic or $10 where id = $1`,
            [id, fields.phone, fields.email, fields.address, fields.medicare, fields.fund, fields.fundNo, fields.dva, dob, fields.diabetic],
          );
        }
        updated.push({ what: 'patient', name });
      } else {
        if (!dryRun) {
          const [ins] = await db.query(
            `insert into patients (name, date_of_birth, phone, email, address, medicare_number, health_fund, health_fund_no, dva_number, diabetic, marketing_opt_in)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null) returning id`,
            [name, dob, fields.phone, fields.email, fields.address, fields.medicare, fields.fund, fields.fundNo, fields.dva, fields.diabetic],
          );
          id = ins.id;
        } else id = `dry:${name}`;
        ids.set(key(name, dob), id); ids.set(key(name, ''), id);
        created.push({ what: 'patient', name });
      }

      // The Medicare clock: the last consult and its item, carried across as an imported record.
      const lastRaw = pick(row, 'last consult', 'last consultation', 'last exam', 'last visit', 'last appointment');
      const lastItem = (pick(row, 'last item', 'last mbs item', 'last item number', 'mbs item') || '').replace(/\D/g, '') || null;
      if (lastRaw) {
        let lastOn = null;
        try { lastOn = parseDate(lastRaw, 'last consult'); } catch { skipped.push({ what: 'consult', why: `${name}: unreadable last consult date "${lastRaw}"` }); }
        if (lastOn && firstOptom) {
          const optomName = (pick(row, 'optometrist', 'last optometrist', 'provider') || '').toLowerCase();
          const exists = dryRun || String(id).startsWith('dry:') ? [] : await db.query('select 1 from exams where patient_id = $1 and on_date = $2', [id, lastOn]);
          if (!exists.length) {
            if (!dryRun) {
              const ref = await mintRef(db, 'exams', 'EXM', 501);
              await db.query(
                `insert into exams (ref, patient_id, optometrist_id, on_date, mbs_item, billing, findings, management, status, finalised_at, imported)
                 values ($1, $2, $3, $4, $5, 'none', 'Carried across from Optomate. The full record is in the Optomate export.', 'See the Optomate record.', 'final', now(), true)`,
                [ref, id, optom.get(optomName) || firstOptom.id, lastOn, lastItem],
              );
            }
            created.push({ what: 'consult', name, on: lastOn, item: lastItem });
          }
        }
      }

      // The recall, as Optomate had it.
      const recallRaw = pick(row, 'recall date', 'next recall', 'recall due', 'recall');
      if (recallRaw) {
        let due = null;
        try { due = parseDate(recallRaw, 'recall date'); } catch { skipped.push({ what: 'recall', why: `${name}: unreadable recall date "${recallRaw}"` }); }
        if (due) {
          const exists = dryRun || String(id).startsWith('dry:') ? [] : await db.query(`select 1 from recalls where patient_id = $1 and due_on = $2`, [id, due]);
          if (!exists.length) {
            if (!dryRun) await db.query('insert into recalls (patient_id, kind, due_on) values ($1, $2, $3)', [id, pick(row, 'recall type', 'recall reason', 'recall description') || 'eye examination', due]);
            created.push({ what: 'recall', name, due });
          }
        }
      }
    }
  }

  if (rxFile) {
    if (!existsSync(rxFile)) throw new CliError(`No file at ${rxFile}.`);
    for (const row of parseCsv(readFileSync(rxFile, 'utf8'))) {
      const name = (pick(row, 'patient name', 'patient', 'name') || `${pick(row, 'given name', 'first name') || ''} ${pick(row, 'surname', 'last name') || ''}`).trim().replace(/\s+/g, ' ');
      const id = name ? find(name, null) : null;
      if (!id) { skipped.push({ what: 'prescription', why: `${name || '(no name)'}: not on the patient list (import patients first)` }); continue; }
      let issued = null;
      try { issued = parseDate(pick(row, 'date', 'rx date', 'issued', 'date issued', 'prescription date'), 'prescription date'); } catch { /* named below */ }
      if (!issued) { skipped.push({ what: 'prescription', why: `${name}: missing or unreadable prescription date` }); continue; }
      const kind = /contact|cl/i.test(pick(row, 'type', 'rx type', 'kind') || '') ? 'contact_lens' : 'spectacle';
      let expires = null;
      try { expires = parseDate(pick(row, 'expiry', 'expires', 'expiry date'), 'expiry'); } catch { /* default below */ }
      if (!expires) expires = addMonths(issued, kind === 'spectacle' ? 24 : 12);
      const n = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(String(v).replace(/[^0-9.+-]/g, '')));
      const exists = dryRun || String(id).startsWith('dry:') ? [] : await db.query('select 1 from prescriptions where patient_id = $1 and kind = $2 and issued_on = $3', [id, kind, issued]);
      if (exists.length) { updated.push({ what: 'prescription', name }); continue; }
      if (!dryRun) {
        await db.query(`update prescriptions set status = 'superseded' where patient_id = $1 and kind = $2 and issued_on < $3`, [id, kind, issued]);
        const ref = await mintRef(db, 'prescriptions', 'RX', 701);
        const [newer] = await db.query('select 1 from prescriptions where patient_id = $1 and kind = $2 and issued_on > $3', [id, kind, issued]);
        await db.query(
          `insert into prescriptions (ref, patient_id, kind, issued_on, expires_on, r_sph, r_cyl, r_axis, r_add, l_sph, l_cyl, l_axis, l_add, pd, lens, status, imported)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true)`,
          [ref, id, kind, issued, expires > issued ? expires : addMonths(issued, 24),
            n(pick(row, 'r sph', 'right sph', 're sph', 'od sph')), n(pick(row, 'r cyl', 'right cyl', 're cyl', 'od cyl')), n(pick(row, 'r axis', 'right axis', 're axis', 'od axis')), n(pick(row, 'r add', 'right add', 're add', 'add')),
            n(pick(row, 'l sph', 'left sph', 'le sph', 'os sph')), n(pick(row, 'l cyl', 'left cyl', 'le cyl', 'os cyl')), n(pick(row, 'l axis', 'left axis', 'le axis', 'os axis')), n(pick(row, 'l add', 'left add', 'le add', 'add')),
            pick(row, 'pd', 'pupillary distance') || null, kind === 'contact_lens' ? pick(row, 'lens', 'contact lens', 'brand') || null : null, newer ? 'superseded' : 'active'],
        );
      }
      created.push({ what: 'prescription', name, issued });
    }
  }

  const result = { dry_run: dryRun, created, updated, skipped };
  if (out(flags, result)) return;
  const count = (arr, what) => arr.filter((x) => x.what === what).length;
  console.log(`${dryRun ? 'Dry run, nothing written. ' : ''}Patients: ${count(created, 'patient')} new, ${count(updated, 'patient')} matched. Past consults: ${count(created, 'consult')}. Recalls: ${count(created, 'recall')}. Prescriptions: ${count(created, 'prescription')} new, ${count(updated, 'prescription')} already here.`);
  for (const s of skipped) console.log(`  Skipped ${s.what}: ${s.why}`);
  if (dryRun) console.log('  Happy with that? Run the same command without --dry-run.');
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

async function cmdExport(db, flags) {
  const dir = path.resolve(str(flags.out) || 'export');
  mkdirSync(dir, { recursive: true });
  const sets = {
    'patients.csv': 'select * from patients order by name',
    'appointments.csv': 'select ref, patient, optometrist, service, mbs_item, on_date, starts_at, status, reason from v_appointments order by on_date, starts_at',
    'exams.csv': 'select e.ref, p.name as patient, o.name as optometrist, e.on_date, e.mbs_item, e.billing, e.item_reason, e.va_right, e.va_left, e.iop_right, e.iop_left, e.history, e.findings, e.management, e.status from exams e join patients p on p.id = e.patient_id join optometrists o on o.id = e.optometrist_id order by e.on_date',
    'prescriptions.csv': 'select ref, patient, kind, issued_on, expires_on, r_sph, r_cyl, r_axis, r_add, l_sph, l_cyl, l_axis, l_add, pd, lens, status from v_prescriptions order by issued_on',
    'jobs.csv': 'select ref, patient, status, frame, lens_desc, lab, rx_ref, ordered_on, promised_on, received_on, collected_on, price_cents from v_jobs order by ordered_on',
    'stock.csv': 'select sku, kind, brand, name, colour, size, cost_cents, retail_cents, on_hand, reorder_at from v_stock order by sku',
    'invoices.csv': 'select ref, patient, payer, issued_on, due_on, total_cents, paid_cents, balance_cents, status from v_invoices order by issued_on',
    'claims.csv': 'select ref, funder, patient, item, amount_cents, service_on, status, lodged_on, paid_on, reject_reason from v_claims order by service_on',
    'recalls.csv': 'select p.name as patient, r.kind, r.due_on, r.status, r.contacts, r.last_contacted_on from recalls r join patients p on p.id = r.patient_id order by r.due_on',
  };
  const written = [];
  for (const [file, sql] of Object.entries(sets)) {
    const rows = await db.query(sql);
    writeFileSync(path.join(dir, file), toCsv(rows));
    written.push({ file, rows: rows.length });
  }
  if (out(flags, { dir, written })) return;
  console.log(`Exported ${written.length} files to ${dir}:`);
  for (const w of written) console.log(`  ${w.file}  ${w.rows} rows`);
}

async function cmdStats(db, flags) {
  const [s] = await db.query(`
    select (select count(*) from patients where status = 'active') as active_patients,
           (select count(*) from optometrists where status = 'active') as optometrists,
           (select count(*) from appointments where status in ('booked', 'confirmed') and on_date >= current_date) as booked_ahead,
           (select count(*) from v_exams_due) as exams_not_final,
           (select count(*) from v_claims where status = 'ready') as claims_ready,
           (select count(*) from v_claims where status = 'ready' and exam_ref is not null and exam_status <> 'final') as claims_blocked,
           (select count(*) from v_claims where status = 'rejected') as claims_rejected,
           (select count(*) from v_claims where status = 'lodged') as claims_lodged,
           (select count(*) from v_jobs where status in ('ordered', 'received', 'ready', 'remake')) as jobs_open,
           (select count(*) from v_jobs where days_late > 0) as jobs_late,
           (select count(*) from v_recalls where due_on < current_date) as recalls_overdue,
           (select count(*) from v_prescriptions where status = 'active' and expired) as rx_expired,
           (select count(*) from v_stock where active and low) as stock_low,
           (select coalesce(sum(balance_cents), 0) from v_invoices where status = 'sent' and payer = 'patient') as patients_owe_cents`);
  const result = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, num(v)]));
  if (out(flags, result)) return;
  console.log(heading('The practice in numbers'));
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.replace(/_/g, ' ').padEnd(22)} ${k.endsWith('_cents') ? money(v) : v}`);
}

function help() {
  console.log(`optometry-for-claude-code

  The book     day [--date=]  book [--days=7 --optometrist=]  book add PATIENT --service=CE --optometrist= --date= --time=
               confirm APT  cancel APT --reason=  dna APT  complete APT [--item=10913 --reason= --billing=bulk|private|dva|none]
  The record   exam APT|EXM  exam record APT|EXM --findings= --management= [--va-right= --iop-right= --dilated --recall=24]
               exam final EXM  exam addendum EXM "text"  exams-due  eligibility [PATIENT]
  Rx           rx PATIENT  rx add PATIENT --kind=spectacle|contact-lens --right="-1.25 -0.50 x180" --left= [--add= --pd= --lens= --months=]
               rx release RX  rx-expiring [--days=]
  Jobs         jobs [--all]  job add PATIENT --frame=SKU|--own-frame= --lens= --lab= --price= [--deposit= --promised=]
               job received|ready|collect JOB  job remake JOB --reason= [--promised=]  job cancel JOB --reason=
  Stock        stock [--kind= --low --aged]  stock add SKU ...  stock receive SKU --qty=  sell PATIENT SKU [--qty= --owing]
  Patients     patients  patient NAME  patient add NAME --dob= ...  patient set NAME ...  log NAME "text"
  Recalls      recalls [--days=]  recall contacted|done PATIENT  recall add PATIENT --due= --kind=
  Claims       claims [--ready --status=]  claim lodge CLM|--ready  claim paid CLM [--amount=]  claim reject CLM --reason=
  Money        invoices [--all]  debtors  pay INV [--amount= --method=]  takings [--days=]  capture [--days=]
  Practice     attention  compliance  team  optometrist add NAME  services  settings [set KEY VALUE]  stats
  Data         import optomate --patients=FILE [--prescriptions=FILE] [--dry-run]  export [--out=DIR]

  Add --json to any command for machine output.`);
}

// ---------------------------------------------------------------------------
// Dispatch

const { args, flags } = parseArgv(process.argv.slice(2));
const [cmd, ...rest] = args;
if (!cmd || cmd === 'help' || (flags.help && !cmd)) { help(); process.exit(0); }

const db = await getDb();
try {
  const sub = (rest[0] || '').toLowerCase();
  switch (cmd) {
    case 'day': await cmdDay(db, flags); break;
    case 'book': if (sub === 'add') await cmdBookAdd(db, rest.slice(1), flags); else await cmdBook(db, flags); break;
    case 'confirm': await setApptStatus(db, rest, flags, 'confirmed'); break;
    case 'cancel': await setApptStatus(db, rest, flags, 'cancelled'); break;
    case 'dna': await setApptStatus(db, rest, flags, 'dna'); break;
    case 'complete': await cmdComplete(db, rest, flags); break;
    case 'exam':
      if (sub === 'record') await cmdExamRecord(db, rest.slice(1), flags);
      else if (sub === 'final') await cmdExamFinal(db, rest.slice(1), flags);
      else if (sub === 'addendum') await cmdExamAddendum(db, rest.slice(1), flags);
      else await cmdExamShow(db, rest, flags);
      break;
    case 'exams-due': await cmdExamsDue(db, flags); break;
    case 'eligibility': await cmdEligibility(db, rest, flags); break;
    case 'rx':
      if (sub === 'add') await cmdRxAdd(db, rest.slice(1), flags);
      else if (sub === 'release') await cmdRxRelease(db, rest.slice(1), flags);
      else await cmdRxList(db, rest, flags);
      break;
    case 'rx-expiring': await cmdRxExpiring(db, flags); break;
    case 'jobs': await cmdJobs(db, flags); break;
    case 'job':
      if (sub === 'add') await cmdJobAdd(db, rest.slice(1), flags);
      else if (['received', 'ready', 'collect', 'remake', 'cancel'].includes(sub)) await cmdJobMove(db, sub, rest.slice(1), flags);
      else throw new CliError('job add|received|ready|collect|remake|cancel (list: jobs)');
      break;
    case 'stock':
      if (sub === 'add') await cmdStockAdd(db, rest.slice(1), flags);
      else if (sub === 'receive') await cmdStockReceive(db, rest.slice(1), flags);
      else await cmdStock(db, flags);
      break;
    case 'sell': await cmdSell(db, rest, flags); break;
    case 'patients': await cmdPatients(db, flags); break;
    case 'patient':
      if (sub === 'add') await cmdPatientAdd(db, rest.slice(1), flags);
      else if (sub === 'set') await cmdPatientSet(db, rest.slice(1), flags);
      else await cmdPatient(db, rest, flags);
      break;
    case 'log': await cmdLog(db, rest, flags); break;
    case 'recalls': await cmdRecalls(db, flags); break;
    case 'recall':
      if (['contacted', 'done', 'add'].includes(sub)) await cmdRecallMove(db, sub, rest.slice(1), flags);
      else throw new CliError('recall contacted|done|add PATIENT (list: recalls)');
      break;
    case 'claims': await cmdClaims(db, flags); break;
    case 'claim':
      if (sub === 'lodge') await cmdClaimLodge(db, rest.slice(1), flags);
      else if (sub === 'paid') await cmdClaimPaid(db, rest.slice(1), flags);
      else if (sub === 'reject') await cmdClaimReject(db, rest.slice(1), flags);
      else throw new CliError('claim lodge|paid|reject CLM-... (list: claims)');
      break;
    case 'invoices': await cmdInvoices(db, flags); break;
    case 'debtors': await cmdDebtors(db, flags); break;
    case 'pay': await cmdPay(db, rest, flags); break;
    case 'takings': await cmdTakings(db, flags); break;
    case 'capture': await cmdCapture(db, flags); break;
    case 'team': await cmdTeam(db, flags); break;
    case 'optometrist':
      if (sub !== 'add') throw new CliError('optometrist add NAME (list: team)');
      await cmdOptometristAdd(db, rest.slice(1), flags);
      break;
    case 'services': await cmdServices(db, flags); break;
    case 'attention': await cmdAttention(db, flags); break;
    case 'compliance': await cmdCompliance(db, rest, flags); break;
    case 'settings': await cmdSettings(db, rest, flags); break;
    case 'import': await cmdImport(db, rest, flags); break;
    case 'export': await cmdExport(db, flags); break;
    case 'stats': await cmdStats(db, flags); break;
    default:
      throw new CliError(`Unknown command "${cmd}". Run with no arguments for the list.`);
  }
} catch (e) {
  if (e instanceof CliError) {
    console.error(e.message);
    process.exitCode = e.code;
  } else {
    throw e;
  }
} finally {
  await db.close();
}
