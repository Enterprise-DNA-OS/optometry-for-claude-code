---
description: Order spectacles and move a job along - ordered, received, ready (the patient is told), collected, remade or cancelled. A job never orders against an expired or superseded prescription, and is not handed over with money owing.
---

1. Order: `node scripts/practice.mjs job add "Name" --frame=SKU --lens="Progressive 1.6, anti-reflective" --lab="..." --price=649 [--deposit=200 --promised=YYYY-MM-DD --dispenser=]`. Their own frame: `--own-frame="description"` instead of `--frame`. It uses their current spectacle prescription unless `--rx=RX-...`.
2. Move it: `job received JOB-...`, `job ready JOB-...` (records that the patient was told; `/draft-reminders` writes the message), `job collect JOB-...`, `job remake JOB-... --reason="..." [--promised=]`, `job cancel JOB-... --reason="..."` (a stock frame goes back on the shelf).
3. If collect refuses because money is owing, take it first: `pay INV-... --amount=`.
