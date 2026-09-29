---
description: Every claim to Medicare, DVA or a health fund - ready, blocked by an unfinished examination, lodged and waiting, rejected with the funder's reason.
---

1. Run `node scripts/practice.mjs claims --json` (`--ready`, or `--status=lodged|rejected|paid`).
2. Say what is ready and what it is worth, what is blocked and by whose examination, what each funder has had longer than three weeks, and every rejection word for word.
3. Next steps: `/lodge`, `/claim-paid`, `/exam` for the blocked ones.
