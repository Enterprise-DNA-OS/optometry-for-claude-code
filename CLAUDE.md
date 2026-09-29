# Optometry Practice for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Practice:** [YOUR PRACTICE]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a patient, read their full card first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a patient waits for a yes in this session.
6. **The record is part of the consult.** A completed consult without a final examination is unfinished work, and its claim cannot lodge; say so whenever you see one.
7. **The item follows the reason.** The clinical reason for the visit decides the Medicare item. Never choose an item to make a claim pay.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "what needs my attention", "what's wrong this morning" | `/attention` |
| "the day sheet", "who is in today / tomorrow" | `/day` |
| "show me the book", "how's next week looking" | `/book` |
| "book X in", "can Hannah fit a consult Thursday" | `/new-appointment` |
| "X is done", "close out the 10 o'clock", "bill it" | `/complete` |
| "write up the exam", "finalise my records", "add an addendum" | `/exam` |
| "what records are owing" | `/exams-due` |
| "can we bulk bill X", "when is X due for Medicare again" | `/eligibility` |
| "X's prescription", "record the new Rx", "X wants a copy of their script" | `/rx` |
| "whose prescriptions are running out" | `/rx-expiring` |
| "what's at the lab", "which glasses are late / waiting" | `/jobs` |
| "order X's glasses", "the lab delivered", "X collected", "remake it" | `/job` |
| "stock", "what do we need to order", "what frames aren't selling" | `/stock` |
| "sell X a box of lenses", "X bought solution" | `/sell` |
| "pull up X", "what do we know about X" | `/patient` |
| "who's due for recall", "overdue glaucoma reviews" | `/recalls` |
| "claims", "what's ready to claim", "what has Medicare / DVA not paid" | `/claims` |
| "lodge today's claims", "do the claiming" | `/lodge` |
| "the remittance came in", "Medicare paid", "that claim was rejected" | `/claim-paid` |
| "what's owing", "invoices", "record a payment" | `/invoices` |
| "who owes us", "aged debtors" | `/debtors` |
| "what did we take", "consults against eyewear" | `/takings` |
| "capture rate", "who walked out with a script" | `/capture` |
| "the team", "add an optometrist", "services and fees" | `/team` |
| "are we compliant", "check the rules" | `/compliance` |
| "Monday review", "how are we set for the week" | `/weekly-review` |
| "note that X rang...", "log the call" | `/log` |
| "remind tomorrow's patients", "tell X their glasses are ready", "chase the overdue invoices" | `/draft-reminders` |
| "recall messages", "win back the ones who walked out" | `/draft-recall` |
| "report to the GP", "diabetic eye report" | `/draft-gp-letter` |
| "bring our Optomate data across" | `/import` |
| "add a field", "change a fee", "our recall for diabetics is 12 months" | `/customise` |
| "a page that shows..." | `/new-view` |

If an ask fits nothing here, run the CLI directly (`node scripts/practice.mjs help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Patients archive, appointments cancel with a reason, jobs cancel, the clinical record stays.
- A finalised examination never changes. Corrections are addenda. Do not look for a way around this; there is none.
- Never invent clinical content or prescription powers. Records carry the optometrist's words and numbers; if something was not said, it stays empty.
- Never lodge a claim ahead of its final examination, never bill a DVA card holder a gap, never order glasses on an expired prescription, never sell contact lenses without a current one. The CLI refuses all four; do not look for a way around them.
- Lodging here records that a claim went through Medicare Online, DVA or HICAPS. Nothing here connects to a funder.
- Messages about buying glasses or lenses only ever address patients who opted in. A clinical recall is care, not marketing; "never asked" still means a phone call for anything commercial.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the rule book (`compliance.md`) and the guide for moving off Optomate.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/optomate
