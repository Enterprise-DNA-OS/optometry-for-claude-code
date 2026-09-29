#!/usr/bin/env node
// Loads supabase/seed.sql: Lakeside Eyecare, a fictional Ballarat practice
// with two optometrists, twenty patients, two years of examinations behind
// and a booked day ahead, prescriptions, frame and contact lens stock,
// spectacle jobs at every stage, and claims from ready to paid. Every row
// has a derived id and inserts with ON CONFLICT DO NOTHING, so re-running
// it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from optometrists)   as optometrists,
           (select count(*) from patients)       as patients,
           (select count(*) from services)       as services,
           (select count(*) from appointments)   as appointments,
           (select count(*) from exams)          as exams,
           (select count(*) from prescriptions)  as prescriptions,
           (select count(*) from stock)          as stock,
           (select count(*) from jobs)           as jobs,
           (select count(*) from invoices)       as invoices,
           (select count(*) from payments)       as payments,
           (select count(*) from claims)         as claims,
           (select count(*) from recalls)        as recalls,
           (select count(*) from patient_notes)  as patient_notes
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const db = await getDb();
  try {
    const counts = await seed(db);
    console.log('seeded:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  } finally {
    await db.close();
  }
}
