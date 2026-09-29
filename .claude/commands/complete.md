---
description: Close out a consult - the examination record opens, the consult is invoiced to the right payer (Medicare bulk bill, DVA, or the patient) and its claim is made ready. The Medicare item gate refuses an item the patient is not eligible for, and says what to bill instead.
---

1. Run `node scripts/practice.mjs complete APT-... --json`. Add `--item=10913 --reason="new floaters"` when the visit is a repeat comprehensive consult inside the interval, `--billing=private` when it is billed to the patient, `--fee=` to change the fee.
2. If it refuses, read the refusal to the operator: it names the last comprehensive consult and the date the routine item becomes claimable again, and the two honest options (10913 or 10914 with the reason, or private). Never pick an item to make a claim pay; the clinical reason decides it.
3. A DVA card holder is never billed privately for a consult: it bills DVA, and the refusal says so.
4. Then the record: `/exam`.
