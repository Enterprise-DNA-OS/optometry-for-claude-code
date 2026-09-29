---
description: The optometrists, their provider and registration numbers, therapeutic endorsement, working days and hours. Add one, and list the services with their fees and Medicare items.
---

1. Run `node scripts/practice.mjs team --json` and `services --json`.
2. Add an optometrist: `optometrist add "Name" --provider= --registration= --days=mon,tue,wed --from=09:00 --to=17:30 [--therapeutic]`.
3. Fees and items change through `/customise` (a new migration), never by hand in the database.
