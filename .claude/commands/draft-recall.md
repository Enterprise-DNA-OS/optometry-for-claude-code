---
description: Draft recall messages for overdue and upcoming recalls, expiring prescriptions and the patients who walked out without glasses - one personal message each in drafts/. Win-back and eyewear messages only go to patients who opted in; the rest get a call list. Never sends.
---

1. Run `node scripts/practice.mjs recalls --json`, `rx-expiring --json` and `capture --json`.
2. A clinical recall (glaucoma, diabetic, AMD, myopia review) is care, not marketing: draft it for anyone with a phone or email, and say plainly why it matters to their eyes. Anything about buying glasses or lenses goes only to those with `marketing_opt_in` true (Spam Act 2003 (Cth); Unsolicited Electronic Messages Act 2007 (NZ)). Everyone else goes on the call list.
3. For each draft, `drafts/recall-<name>.md`: two or three lines from their own optometrist, naming what the recall is for and when they were last seen, with two times from the book this week or next (`book --json`). Read their card first (`patient NAME --json`): a log line like "daughter drives her, Tuesdays best" changes the times offered.
4. One extra file, `drafts/recall-summary.md`: who got a draft, who is on the call list with their number, and what each is worth. A person sends these.
