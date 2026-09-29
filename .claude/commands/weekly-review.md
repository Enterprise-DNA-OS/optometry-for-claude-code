---
description: The Monday review, written from five commands - what needs a decision, the week's book, the money (claims, debtors, takings), the lab and the front counter (jobs, stock), and the clinical follow-up (recalls, expiring prescriptions, capture).
---

1. Run five commands, `--json` each: `node scripts/practice.mjs attention`, `book`, `claims`, `jobs`, `recalls`. Add `takings --days=7`, `capture`, `stock --low` and `rx-expiring` when there is room.
2. Write the review in four short sections, prose plus small tables, nothing invented:
   - **Today's decisions.** The attention list, worst first, one action each. An examination not finalised or a booking Medicare will not pay is the first line of the review.
   - **The week's book.** Day by day: how full each optometrist is, what is unconfirmed, where the gaps are and which recalls fit them.
   - **The money.** Claims ready, blocked and waiting, rejections, patients owing, last week's consults against eyewear.
   - **The lab and the counter.** Late jobs, glasses waiting, remakes, stock to reorder and frames not moving.
3. End with at most five actions for the week, each doable with a single command or phone call.
4. On paper: `npm run view` renders the week, clinical and money pages in the practice's brand.
