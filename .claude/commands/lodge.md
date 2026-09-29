---
description: Lodge the ready claims in one batch; anything whose examination is not final, or that was rejected and not yet fixed, is held back and named.
---

1. Confirm they have gone through Medicare Online, DVA or HICAPS: this records that they were lodged, it does not send them. Nothing here connects to a funder.
2. Run `node scripts/practice.mjs claim lodge --ready --json`, or `claim lodge CLM-...` for one.
3. A rejected claim relodges only with the fix recorded: `claim lodge CLM-... --fixed="what changed" [--item=10913]`.
4. Report what lodged (count and dollars) and what was held back, with the reason for each.
