---
description: Draft tomorrow's appointment reminders, glasses-ready messages and overdue-invoice nudges into drafts/ - a person sends them. Reminders about a booking or a finished job are not marketing and need no opt-in.
---

1. Run `node scripts/practice.mjs day --date=tomorrow --json`, `jobs --json` and `invoices --json`.
2. For each UNCONFIRMED booking tomorrow, write `drafts/reminder-<name>.md`: the time, the optometrist, a reply-to-confirm ask, and "bring your current glasses and any contact lenses", with the patient's phone on top.
3. For each job that is received or ready and not yet collected, write `drafts/glasses-ready-<name>.md`: ready to collect, the opening hours, and the balance owing if there is one. Then record it: `job ready JOB-...`.
4. For each patient invoice past due, write `drafts/nudge-<name>.md`: friendly, names the invoice and the amount. Read the card first (`patient NAME --json`).
5. One summary file, `drafts/reminders-summary.md`: who got which draft and who needs a phone call instead. This system never sends anything.
