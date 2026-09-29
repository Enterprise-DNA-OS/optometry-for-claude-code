---
description: Every consult without a final examination record, oldest first, with the optometrist it belongs to. Each one blocks its claim.
---

1. Run `node scripts/practice.mjs exams-due --json`.
2. Group by optometrist, oldest first. Say what each one is holding up (`claims --json`, the blocked column).
3. Offer to take each record down now with `/exam`.
