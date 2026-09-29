---
description: Who owes the practice - patients, Medicare, DVA and the funds - and how much is over 30 days.
---

1. Run `node scripts/practice.mjs debtors --json` and `invoices --json`.
2. Patients first (by name, oldest first, with the job it belongs to), then each funder. For funders, point to `/claims`: an unpaid funder invoice is a claim to chase.
