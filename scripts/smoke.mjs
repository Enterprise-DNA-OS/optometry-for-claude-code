#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.
//
// The seed anchors everything to current_date offsets, so every assertion
// here holds whatever day you run it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'optometry-smoke-'));
const scratch = mkdtempSync(path.join(tmpdir(), 'optometry-smoke-files-'));
const env = { ...process.env, DATA_DIR: dataDir, OUTPUT_DIR: scratch };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json && !expectFail ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function refuses(label, args, pattern) {
  const r = run(label, args, { expectFail: true });
  assert(pattern.test(r.stderr), `${label}: the refusal says why (${r.stderr.trim()})`);
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (d) => {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const now = new Date();
const day = (offset) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
const dow = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getDay();
// Hannah works Monday to Friday; Arjun Tuesday to Sunday. Between them, every day.
const todays = [1, 2, 3, 4, 5].includes(dow(0)) ? 'Hannah' : 'Arjun';
let weekdayAhead = 4;
while (![1, 2, 3, 4, 5].includes(dow(weekdayAhead))) weekdayAhead++;

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the numbers, before anything moves ------------------------------------

  const stats = run('stats', ['practice.mjs', 'stats']);
  assert(n(stats.active_patients) === 20, `twenty patients (${stats.active_patients})`);
  assert(n(stats.optometrists) === 2, `two optometrists (${stats.optometrists})`);
  assert(n(stats.exams_not_final) === 2, `two consults without a final examination (${stats.exams_not_final})`);
  assert(n(stats.claims_ready) === 4 && n(stats.claims_blocked) === 1, `four ready claims, one blocked (${stats.claims_ready}, ${stats.claims_blocked})`);
  assert(n(stats.claims_rejected) === 1 && n(stats.claims_lodged) === 1, 'one rejected, one lodged and waiting');
  assert(n(stats.jobs_open) === 3 && n(stats.jobs_late) === 1, `three jobs open, one late (${stats.jobs_open}, ${stats.jobs_late})`);
  assert(n(stats.recalls_overdue) === 3, `three recalls overdue (${stats.recalls_overdue})`);
  assert(n(stats.rx_expired) === 1, `one expired prescription (${stats.rx_expired})`);
  assert(n(stats.stock_low) === 2, `two lines to reorder (${stats.stock_low})`);
  assert(n(stats.patients_owe_cents) === 46900, `patients owe $469 (${stats.patients_owe_cents})`);

  const attention = run('attention', ['practice.mjs', 'attention']);
  const reasons = new Set(attention.map((r) => r.reason));
  for (const r of ['exam_missing', 'exam_draft', 'item_not_claimable', 'claim_rejected', 'claim_blocked', 'cl_rx_expired', 'claims_ready', 'job_late', 'job_uncollected', 'claim_unpaid', 'recall_overdue', 'rx_expiring', 'unconfirmed', 'stock_low', 'stock_not_moving', 'recall_due_soon']) {
    assert(reasons.has(r), `attention raises ${r}`);
  }
  assert(attention[0].rank === 1, 'worst first');
  assert(attention.find((r) => r.reason === 'item_not_claimable').who === 'Tom Nguyen', 'Tom\'s 10910 tomorrow is the one Medicare will not pay');
  assert(/phone call/.test(attention.find((r) => r.who === 'Jack Harper').detail), 'Jack never opted in: he gets a call, not a message');

  const tom = run('eligibility for one patient', ['practice.mjs', 'eligibility', 'Tom']);
  assert(tom.claimable_now === false && tom.routine_item === '10910', 'Tom is inside his 36 months');
  const margaret = run('and an older patient', ['practice.mjs', 'eligibility', 'Margaret']);
  assert(margaret.claimable_now === true && margaret.routine_item === '10911', 'Margaret at 71 is due her 10911');

  for (const cmd of ['day', 'book', 'exams-due', 'eligibility', 'rx-expiring', 'jobs', 'stock', 'patients', 'recalls', 'invoices', 'debtors', 'takings', 'capture', 'team', 'services', 'settings']) {
    run(cmd, ['practice.mjs', cmd]);
  }
  const capture = run('capture by optometrist', ['practice.mjs', 'capture']);
  assert(capture.walked_out.some((w) => w.patient === 'Chloe Martin'), 'Chloe walked out with a new prescription');
  const ppl = run('one patient card', ['practice.mjs', 'patient', 'Liam']);
  assert(ppl.jobs.length === 1 && ppl.jobs[0].balance_cents === 12000, 'Liam has one job and $120 owing');

  // ---- the book --------------------------------------------------------------------------

  const future = day(weekdayAhead);
  const booked = run('book a follow-up', ['practice.mjs', 'book', 'add', 'Grace Kim', '--service=CE', '--optometrist=Hannah', `--date=${future}`, '--time=13:00', '--reason=prescription running out']);
  assert(booked.ref && booked.warnings.length === 1, `Grace books, with a warning that 10910 will not pay (${JSON.stringify(booked.warnings)})`);
  refuses('no double booking', ['practice.mjs', 'book', 'add', 'Chloe Martin', '--service=CE', '--optometrist=Hannah', `--date=${future}`, '--time=13:15'], /already has Grace Kim/);
  refuses('no booking outside hours', ['practice.mjs', 'book', 'add', 'Chloe Martin', '--service=CE', '--optometrist=Hannah', `--date=${future}`, '--time=17:15'], /outside Hannah Webb's hours/);
  refuses('a cancel needs a reason', ['practice.mjs', 'cancel', booked.ref], /reason/);
  run('cancel with a reason', ['practice.mjs', 'cancel', booked.ref, '--reason=rang to move it']);
  refuses('no no-show before the day', ['practice.mjs', 'dna', 'APT-1022'], /on or after the day/);
  run('confirm tomorrow', ['practice.mjs', 'confirm', 'APT-1021']);

  // ---- the Medicare item gate, on a consult today --------------------------------------------

  const today = run('book Tom in today', ['practice.mjs', 'book', 'add', 'Tom Nguyen', '--service=CE', `--optometrist=${todays}`, `--date=${day(0)}`, '--time=16:00', '--reason=sudden floaters']);
  refuses('10910 inside 36 months is refused', ['practice.mjs', 'complete', today.ref], /payable once in 36 months/);
  refuses('10913 needs its reason', ['practice.mjs', 'complete', today.ref, '--item=10913'], /clinical reason/);
  const done = run('10913 with the reason', ['practice.mjs', 'complete', today.ref, '--item=10913', '--reason=new floaters and a flash in the right eye']);
  assert(done.claim && done.claim.funder === 'medicare' && done.item === '10913', 'Tom\'s consult bills 10913 to Medicare');
  refuses('an exam without findings will not finalise', ['practice.mjs', 'exam', 'final', done.exam], /--findings/);
  run('record the examination', ['practice.mjs', 'exam', 'record', done.exam, '--findings=Posterior vitreous detachment, no retinal tear', '--management=Warning signs explained. Review in 6 weeks.', '--dilated', '--va-right=6/6', '--va-left=6/6', '--iop-right=14', '--iop-left=15']);
  const fin = run('finalise it', ['practice.mjs', 'exam', 'final', done.exam]);
  assert(fin.status === 'final', 'final');
  refuses('a final examination never changes', ['practice.mjs', 'exam', 'record', done.exam, '--findings=changed'], /addendum/);
  run('corrections are addenda', ['practice.mjs', 'exam', 'addendum', done.exam, 'Retinal tear excluded with scleral depression.']);
  const shown = run('the examination with its addendum', ['practice.mjs', 'exam', done.exam]);
  assert(shown.addenda.length === 1 && shown.findings.startsWith('Posterior'), 'the original stands, the addendum sits beside it');

  // ---- the missing record, and the draft ------------------------------------------------------

  run('write Daniel\'s missing examination', ['practice.mjs', 'exam', 'record', 'APT-1004', '--findings=Low hyperopia, healthy eyes', '--management=Computer glasses', '--recall=24']);
  const danielFinal = run('and finalise it', ['practice.mjs', 'exam', 'final', 'APT-1004']);
  assert(danielFinal.recall && danielFinal.recall.kind === 'eye examination', 'finalising sets the next recall');
  run('finish Priya\'s draft', ['practice.mjs', 'exam', 'record', 'EXM-503', '--management=Progressives for work']);
  run('and finalise it', ['practice.mjs', 'exam', 'final', 'EXM-503']);

  // ---- claims ----------------------------------------------------------------------------------

  const lodged = run('lodge everything ready', ['practice.mjs', 'claim', 'lodge', '--ready']);
  assert(lodged.lodged.length === 5, `five claims lodge now that the records are final (${lodged.lodged.length})`);
  const rejectedHeld = run('a rejected claim waits for its fix', ['practice.mjs', 'claim', 'lodge', 'CLM-4005']);
  assert(rejectedHeld.lodged.length === 0 && rejectedHeld.held.length === 1, 'held back until the cause is recorded');
  const relodged = run('relodge with the fix', ['practice.mjs', 'claim', 'lodge', 'CLM-4005', '--fixed=rebilled privately', '--item=10913']);
  assert(relodged.lodged.length === 1, 'relodged');
  const paid = run('DVA pays', ['practice.mjs', 'claim', 'paid', 'CLM-4004']);
  assert(paid.paid_cents === 7200, 'paid in full');
  const inv = run('and the invoice clears', ['practice.mjs', 'invoices', '--all']);
  assert(inv.find((i) => i.ref === 'INV-2004').balance_cents === 0, 'INV-2004 is paid');
  run('a rejection is kept word for word', ['practice.mjs', 'claim', 'reject', 'CLM-4001', '--reason=Patient Medicare card expired']);

  // ---- prescriptions and supply ----------------------------------------------------------------

  refuses('no contact lenses on an expired prescription', ['practice.mjs', 'sell', 'Sofia Russo', 'CL-DT1-90'], /expired/);
  refuses('a prescription is not unreasonably short', ['practice.mjs', 'rx', 'add', 'Sofia Russo', '--kind=contact-lens', '--right=-3.00', '--left=-3.25', '--lens=Dailies Total1', '--months=1'], /unreasonably short/);
  const cl = run('a new contact lens prescription', ['practice.mjs', 'rx', 'add', 'Sofia Russo', '--kind=contact-lens', '--right=-3.00', '--left=-3.25', '--lens=Dailies Total1 BC 8.5 DIA 14.1']);
  assert(cl.state === 'current' && cl.expires === (() => { const d = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()); return iso(d); })(), `twelve months by default (${cl.expires})`);
  const sale = run('now the box sells', ['practice.mjs', 'sell', 'Sofia Russo', 'CL-DT1-90']);
  assert(sale.paid && sale.on_hand === 9, 'sold and counted');
  const old = run('the old copy is marked expired', ['practice.mjs', 'rx', 'release', 'RX-706']);
  assert(old.note && /EXPIRED/.test(old.note), 'an expired copy says so');
  refuses('an eye that makes no sense', ['practice.mjs', 'rx', 'add', 'Grace Kim', '--right=-2.00 -0.50 x200'], /Axis/);

  // ---- jobs -----------------------------------------------------------------------------------

  refuses('no spectacles without a spectacle prescription', ['practice.mjs', 'job', 'add', 'Sofia Russo', '--frame=FR-LSE-001', '--lens=SV', '--lab=Coastal', '--price=300'], /no spectacle prescription/);
  const job = run('order Chloe\'s glasses', ['practice.mjs', 'job', 'add', 'Chloe Martin', '--frame=FR-TF5634-53', '--lens=Single vision 1.6', '--lab=Prism Lens Co', '--price=695', '--deposit=200']);
  assert(job.balance_cents === 49500, `a deposit leaves $495 (${job.balance_cents})`);
  refuses('the last frame is gone', ['practice.mjs', 'job', 'add', 'Marcus Bell', '--frame=FR-TF5634-53', '--lens=SV', '--lab=Prism', '--price=695'], /none on hand/);
  refuses('no hand-over with money owing', ['practice.mjs', 'job', 'collect', 'JOB-3002'], /owing/);
  run('take the balance', ['practice.mjs', 'pay', 'INV-2102']);
  const collected = run('then hand them over', ['practice.mjs', 'job', 'collect', 'JOB-3002']);
  assert(collected.status === 'collected', 'collected');
  run('the lab delivers Priya\'s', ['practice.mjs', 'job', 'ready', 'JOB-3001']);
  refuses('a remake needs a reason', ['practice.mjs', 'job', 'remake', 'JOB-3001'], /reason/);
  refuses('no overpaying', ['practice.mjs', 'pay', 'INV-2101', '--amount=1000'], /more than that/);

  // ---- stock and recalls -----------------------------------------------------------------------

  run('receive contact lenses', ['practice.mjs', 'stock', 'receive', 'CL-OASYS-6', '--qty=6']);
  const low = run('reorder list', ['practice.mjs', 'stock', '--low']);
  assert(low.length === 1 && low[0].sku === 'SOL-BIOTRUE-300', 'only the solution still needs ordering');
  run('recall contact', ['practice.mjs', 'recall', 'contacted', 'Jack Harper']);
  run('log a call', ['practice.mjs', 'log', 'Jack Harper', 'Rang, booked for next week']);

  // ---- compliance after the fixes ----------------------------------------------------------------

  const comp = run('compliance', ['practice.mjs', 'compliance']);
  assert(comp.checks.length === 7, `seven rules (${comp.checks.length})`);
  assert(comp.breached === 0, `every rule holds once the records are written (${JSON.stringify(comp.checks.filter((c) => !c.ok))})`);

  // ---- import from Optomate ----------------------------------------------------------------------

  const patientsCsv = path.join(scratch, 'Patients.csv');
  writeFileSync(patientsCsv, [
    'Given Name,Surname,Date of Birth,Mobile,Email,Medicare No,Health Fund,Last Consult,Last Item,Recall Date,Recall Type',
    `Zoe,Adams,14/03/1990,0430 111 222,zoe@example.com,4123 45678 1,Bupa,${day(-200).split('-').reverse().join('/')},10910,${day(530).split('-').reverse().join('/')},Eye examination`,
    'Tom,Nguyen,,,,,,,,,',
    ',,,0430 999 000,,,,,,,',
    'Walter,Price,31/31/1950,0430 333 444,,,,,,,',
  ].join('\n'));
  const rxCsv = path.join(scratch, 'Prescriptions.csv');
  writeFileSync(rxCsv, [
    'Patient Name,Type,Date,R Sph,R Cyl,R Axis,L Sph,L Cyl,L Axis,Add,PD',
    `Zoe Adams,Spectacles,${day(-200)},-1.50,-0.50,90,-1.75,,,,62`,
    'Nobody Here,Spectacles,2025-01-01,-1.00,,,-1.00,,,,60',
  ].join('\n'));
  const dry = run('import dry run', ['practice.mjs', 'import', 'optomate', `--patients=${patientsCsv}`, `--prescriptions=${rxCsv}`, '--dry-run']);
  assert(dry.dry_run === true && dry.created.some((c) => c.what === 'patient' && c.name === 'Zoe Adams'), 'the dry run names who would land');
  assert(dry.skipped.some((s) => /no name/.test(s.why)) && dry.skipped.some((s) => /Walter Price: unreadable date of birth/.test(s.why)), `and names the bad rows (${JSON.stringify(dry.skipped)})`);
  const before = run('nothing was written', ['practice.mjs', 'stats']);
  assert(n(before.active_patients) === 20, 'still twenty after the dry run');
  const imported = run('import for real', ['practice.mjs', 'import', 'optomate', `--patients=${patientsCsv}`, `--prescriptions=${rxCsv}`]);
  assert(imported.created.some((c) => c.what === 'consult' && c.item === '10910'), 'Zoe\'s last consult came across with its item');
  assert(imported.created.some((c) => c.what === 'prescription' && c.name === 'Zoe Adams'), 'and her prescription');
  assert(imported.updated.some((u) => u.what === 'patient' && u.name === 'Tom Nguyen'), 'Tom matched, not duplicated');
  assert(imported.skipped.some((s) => /Nobody Here/.test(s.why)), 'a prescription for nobody on the list is named');
  const again = run('import again (idempotent)', ['practice.mjs', 'import', 'optomate', `--patients=${patientsCsv}`, `--prescriptions=${rxCsv}`]);
  assert(!again.created.length, `the second pass creates nothing (${JSON.stringify(again.created)})`);
  const zoe = run('the Medicare clock came with her', ['practice.mjs', 'eligibility', 'Zoe']);
  assert(zoe.claimable_now === false, 'Zoe is inside her 36 months');
  const zoeCard = run('and she was never opted in by a spreadsheet', ['practice.mjs', 'patient', 'Zoe']);
  assert(zoeCard.patient.marketing_opt_in === null, 'the marketing question gets asked fresh');
  const due = run('imported history does not owe examinations', ['practice.mjs', 'exams-due']);
  assert(due.every((r) => r.patient !== 'Zoe Adams'), 'the old record lives in the Optomate export');

  // ---- views, documents, export --------------------------------------------------------------------

  run('views render', ['view.mjs'], { json: false });
  for (const v of ['week', 'clinical', 'money']) assert(existsSync(path.join(scratch, 'views', `${v}.html`)), `${v}.html rendered`);
  run('documents render', ['docs.mjs'], { json: false });
  for (const d of ['invoice', 'prescription', 'gp-report', 'lab-docket']) assert(readdirSync(path.join(scratch, 'docs-out', d)).length > 0, `${d} documents rendered`);
  const expiredDoc = readdirSync(path.join(scratch, 'docs-out', 'prescription')).find((f) => f.startsWith('rx-705'));
  assert(expiredDoc && /current/.test(readFileSync(path.join(scratch, 'docs-out', 'prescription', expiredDoc), 'utf8')), 'the prescription document states its state');

  const exported = run('export', ['practice.mjs', 'export', `--out=${path.join(scratch, 'out')}`]);
  assert(exported.written.length === 9, `nine files (${exported.written.length})`);
  for (const w of exported.written) {
    assert(existsSync(path.join(scratch, 'out', w.file)), `${w.file} exists`);
    assert(readFileSync(path.join(scratch, 'out', w.file), 'utf8').split('\n').length > 2, `${w.file} has rows`);
  }

  console.log(`\nPASS: ${step} steps.`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
