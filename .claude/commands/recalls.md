---
description: Recalls due or overdue - glaucoma reviews, diabetic eye checks, myopia reviews, contact lens aftercare, routine examinations - with how many times each patient has been contacted and how to reach them.
---

1. Run `node scripts/practice.mjs recalls --json` (`--days=N` to look further ahead).
2. Clinical recalls first (glaucoma, diabetic, AMD, myopia), then routine ones. Say who has been contacted and how often.
3. Record a contact: `recall contacted "Name"`; after the last one with no answer, `--final` closes it as lapsed. `recall done` when it is dealt with; booking the appointment answers it on its own.
4. Messages: `/draft-recall`.
