---
description: When Medicare pays for a comprehensive consult again - per patient or the whole book. 10910 once in 36 months under 65, 10911 once in 12 months at 65 and over, 10915 for patients with diabetes.
---

1. One patient: `node scripts/practice.mjs eligibility "Name" --json`. The whole book: `eligibility --json`.
2. Say plainly: claimable now, or the date it becomes claimable, and the last comprehensive consult it counts from.
3. Always add the caveat the command prints: only consults on this record count. A new patient may have been seen elsewhere; ask them, and check with Medicare before bulk billing.
4. For recall planning: the patients who are claimable now with nothing booked are the recall list worth working first.
