---
description: A counter sale - contact lenses, solution, accessories. Contact lenses never sell without a current contact lens prescription on record.
---

1. Run `node scripts/practice.mjs sell "Name" SKU [--qty=N] --json`. It records payment at the counter unless `--owing`.
2. If it refuses for an expired or missing contact lens prescription, say so plainly and offer to book the aftercare (`/new-appointment` with `--service=CLAC`). Never record the sale some other way.
