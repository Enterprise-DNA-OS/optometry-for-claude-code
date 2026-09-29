---
description: Check the records against the rules an optometry practice lives under - examination records finalised, Medicare items billed inside their age, interval and reason rules, no claim ahead of its record, no gap for DVA, prescriptions with reasonable expiry dates, supply only on a current prescription, and dates of birth on booked patients - with each rule's source.
---

1. Run `node scripts/practice.mjs compliance --json`.
2. Report as a table: rule, OK or BREACH, what was found, the source. Breaches first.
3. For each breach, the fix the operator can approve: write and finalise the examination, rebill the item, record the date of birth.
4. `docs/compliance.md` holds each rule and its source. If a rule is out of date (the MBS changes every March and November), say so and stop. Do not guess at the schedule: the operator confirms the rule, then the doc and the check change together.

Nothing here is legal or billing advice. The doc records the rules the practice has told the system to enforce.
