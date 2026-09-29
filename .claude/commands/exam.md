---
description: The examination record - write it, finalise it, and after that corrections are dated addenda only. A 10915 needs dilation recorded; a 10913 or 10914 needs its reason. Finalising sets the next recall.
---

1. Show one: `node scripts/practice.mjs exam EXM-... --json` (or the appointment ref).
2. Write it from the optometrist's words only: `exam record EXM-... --history="..." --findings="..." --management="..." --va-right=6/6 --va-left=6/6 --iop-right=14 --iop-left=15 [--dilated] --recall=24 --recall-kind="eye examination"`. A consult with no examination yet: `exam record APT-...` creates it.
3. Finalise: `exam final EXM-...`. It refuses without findings and management, a 10915 without dilation, a 10913 or 10914 without the reason. It names the claim that can lodge now.
4. After final: `exam addendum EXM-... "text"`. Never look for a way to edit a final record; there is none.
5. Never invent a clinical finding. If a field was not said, it stays empty and you ask.
