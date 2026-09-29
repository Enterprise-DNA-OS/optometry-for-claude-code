---
description: Everything that wants a decision this morning, worst first. A consult with no final examination outranks everything, then a booking Medicare will not pay, rejected and blocked claims, a contact lens wearer out of prescription, claims sitting unlodged, late and uncollected glasses, funders sitting on money, overdue recalls, expiring prescriptions, unconfirmed bookings and stock.
---

1. Run `node scripts/practice.mjs attention --json`.
2. Present it worst first, grouped by reason, in the practice's words. Lead with anything rank 1 (an examination missing or in draft, a booking billed as an item Medicare will not pay): those are today's first jobs, say so plainly.
3. For each group, say the one action that clears it: `exam record` then `exam final`, rebook as 10913 with the reason or tell the patient the private fee before they arrive, `claim lodge --ready`, chase the lab, `pay` then `job collect`, `/draft-recall` or a phone call, `confirm APT-...`, `stock receive`.
4. If the list is empty, say so in one line and stop.
