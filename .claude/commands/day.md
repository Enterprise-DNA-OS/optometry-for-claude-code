---
description: The day sheet - who is in, with whom, the Medicare item each consult will bill, and what to know before they walk in (unconfirmed, DVA, diabetic, clinical flags, money owing, glasses ready to collect, an item Medicare will not pay).
---

1. Run `node scripts/practice.mjs day --date=<today|tomorrow|YYYY-MM-DD> --json`.
2. Present it by optometrist, in time order. Put the alerts first on each line: a booking marked NOT 10910 or NOT 10911 needs a decision before the patient arrives (10913 with the reason written, or a private fee they are told about).
3. Mention glasses waiting to be collected by anyone on the list: hand them over while they are here.
