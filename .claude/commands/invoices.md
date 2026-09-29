---
description: What is billed and what is owing, to patients, Medicare, DVA and the funds. Record a payment.
---

1. Run `node scripts/practice.mjs invoices --json` (`--all` for paid ones too).
2. Record a payment: `pay INV-... [--amount=] [--method=eftpos|cash|health fund]`. A payment never exceeds the balance.
