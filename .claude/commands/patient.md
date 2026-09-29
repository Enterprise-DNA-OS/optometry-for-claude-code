---
description: One patient's whole card before they are in the room - Medicare eligibility, clinical flags, recent examinations, current prescriptions, jobs in flight, recalls, money owing and the log.
---

1. Run `node scripts/practice.mjs patient "Name" --json`.
2. Present it short: who they are, whether their comprehensive consult is claimable today, clinical flags, the current prescriptions and expiry dates, anything waiting (glasses, a recall, money), the last log line.
3. To change details: `patient set "Name" --phone= --dob= --medicare= --fund= --dva= --diabetic --conditions= --marketing=yes|no`. To add someone: `patient add`.
