---
description: The report to the patient's GP after a diabetic, glaucoma or other clinical examination - written from the finalised examination only, into drafts/, with the branded version from npm run docs.
---

1. Run `node scripts/practice.mjs exam EXM-... --json` and `patient "Name" --json`. The examination must be final; if it is a draft, say so and stop.
2. Write `drafts/gp-report-<name>.md`: the date, what was examined (dilated or not), visual acuity and pressures, the findings and plan in the optometrist's words, and when they will be seen again. Nothing added, nothing softened.
3. `npm run docs -- gp-report` renders the branded version from the same record. A person sends it, through the channel the practice uses for GP correspondence.
