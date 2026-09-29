---
description: Capture rate - how many new spectacle prescriptions became a job here within 30 days, by optometrist, and who walked out with a prescription and no order.
---

1. Run `node scripts/practice.mjs capture --days=90 --json`.
2. Give the rate per optometrist in one line each. Then the walked-out list: these are the patients worth a friendly call about frames, and for those who opted in, `/draft-recall` can write it.
3. Do not read a low rate as a verdict on one person from a handful of consults. Say how many prescriptions it rests on.
