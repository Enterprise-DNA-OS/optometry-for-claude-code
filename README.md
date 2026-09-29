<h1 align="center">Optometry Practice for Claude Code</h1>

<p align="center">
  <strong>The open-source optometry practice management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Optomate data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=optomate">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/optomate?utm_source=github&utm_medium=readme&utm_campaign=optomate">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-optomate">Instead of Optomate</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Optometry Practice for Claude Code does the job you pay Optomate for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Optomate dashboard cannot.

The bill this replaces is per location, per month: Optomate.Net Core is A$300 a location a month before tax (A$3,600 a year), and online Medicare and DVA claiming (A$25 a month), health fund claiming (A$25), web bookings (A$10) and frame trace storage (A$10) are add-ons on top, with SMS at 8 cents a message ([optomate.net/pricing](https://www.optomate.net/pricing)). A three-store group pays at least A$10,800 a year before a single add-on.

Want the same thing with a front desk screen, an online booking page, or claiming wired straight to Medicare? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=optomate).

This one covers the operating record of an independent optometry practice: the optometrists and their hours, the patient book, the appointment book, **examinations with the Medicare item each one bills**, spectacle and contact lens **prescriptions with their expiry dates**, frame and contact lens **stock**, **spectacle jobs** from order to the lab to the patient's hands, invoices, **claims** to Medicare, DVA and the health funds from ready to paid, and **recalls** for glaucoma, diabetic, AMD and myopia reviews. The rules of the trade are built in as gates with their sources cited: a 10910 is refused inside 36 months and a 10911 inside 12, a 10913 or 10914 needs its clinical reason written, a 10915 needs a patient with diabetes and dilation recorded, a claim never lodges ahead of a final examination, a DVA card holder is never billed a gap, spectacles are never ordered on an expired prescription, contact lenses never sell without a current one, and a finalised examination is never edited. Payment processing, the funders' claiming channels, equipment links and ePrescribing stay where they are, deliberately.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No per-location fee, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/optometry-for-claude-code.git
cd optometry-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo practice, Lakeside Eyecare in Ballarat, has a consult five days ago with no examination on record, another nine days in draft holding its Medicare claim back, Tom Nguyen booked tomorrow as a 10910 ten months after his last one (Medicare will not pay it), three bulk-billed claims ready and never lodged, a DVA claim unpaid for 30 days, a Medicare rejection nobody has read, glasses two days late at the lab and another pair uncollected for three weeks with $120 owing, a contact lens wearer whose prescription ran out ten days ago, a glaucoma suspect 35 days past her recall, a diabetic eye check overdue for a patient who never agreed to messages, and six designer frames that have not sold in over a year. The answer shows you exactly how this system thinks.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-location fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first. A consult with no final examination outranks everything, because it blocks the claim too |
| `/day` | The day sheet: the item each consult will bill, and what to know before they walk in |
| `/book` | The appointment book, unconfirmed bookings loud |
| `/new-appointment` | Book a patient in; it warns when the Medicare item is not claimable yet |
| `/complete` | Close out a consult: the examination opens, the invoice and the claim are made, the item gate speaks |
| `/exam` | The examination record: write it, finalise it, then addenda only |
| `/exams-due` | Every consult without a final examination, oldest first |
| `/eligibility` | When Medicare pays for a comprehensive consult again, per patient or the whole book |
| `/rx` | Prescriptions: record one with its expiry, release a copy (marked EXPIRED if it has lapsed) |
| `/rx-expiring` | Prescriptions about to lapse with nothing booked |
| `/jobs` `/job` | Spectacle jobs from order to lab to collection; no order on an expired prescription, no hand-over with money owing |
| `/stock` `/sell` | Frames, contact lenses and solutions: reorder, not moving, value at cost; counter sales on a current prescription |
| `/patient` | One patient's whole card before they are in the room |
| `/recalls` | Glaucoma, diabetic, AMD, myopia and routine recalls, with the contacts made |
| `/claims` `/lodge` `/claim-paid` | Every claim to Medicare, DVA or a fund, from ready to paid or rejected |
| `/invoices` `/debtors` | What is billed and owing, patients and funders separately |
| `/takings` | Consults against eyewear, and consults by optometrist |
| `/capture` | New prescriptions that became a job here, by optometrist, and who walked out |
| `/team` | The optometrists, their numbers and hours; the services with their fees and items |
| `/compliance` | The rule book run against the records, sources cited |
| `/weekly-review` | The Monday review written from five commands |
| `/log` | The conversation onto the patient's card |
| `/draft-reminders` `/draft-recall` `/draft-gp-letter` | Drafts to `drafts/`; a person sends them |
| `/import` | Bring the practice across from Optomate, dry-run first |
| `/customise` | Change a fee, an item rule, a recall interval, in plain language |
| `/new-view` | A new read-only dashboard page, described in plain language |

`npm run view` renders the week, the clinical record (Medicare eligibility, expiring prescriptions, clinical flags) and the money (claims by state, debtors, stock) as branded HTML pages. `npm run docs` renders tax invoices, the patient's prescription copy, the report to the GP and the lab docket for every job at the lab.

## Instead of Optomate

Run a patient list report in Optomate with each patient's last consult, last item and recall, and save it as CSV (a prescriptions report too, if your version has one), then:

```bash
node scripts/practice.mjs import optomate --patients=Patients.csv --prescriptions=Prescriptions.csv --dry-run
node scripts/practice.mjs import optomate --patients=Patients.csv --prescriptions=Prescriptions.csv
```

The importer matches common column-name variants, is idempotent (re-running creates nothing twice), and names every row it skips. Each patient's last consult and its item come across, so the Medicare clock is right from the first day. Two things are deliberate: every imported patient arrives with the marketing question unanswered, and old examination records stay in Optomate's own export as your retention copy rather than being re-typed. [docs/replace-optomate.md](docs/replace-optomate.md) covers exactly what carries over, what starts fresh, and why.

### Ten questions your practice software cannot answer

Each is one plain-language ask in Claude Code, and each is a command that runs today:

1. Who is booked this fortnight as a 10910 or 10911 that Medicare will not pay, and when does each become claimable? (`attention`, `eligibility`)
2. Which returning patients are claimable for a comprehensive consult right now and have nothing booked? (`eligibility`, `recalls`)
3. Which claims are ready to lodge, what are they worth, and whose unfinished examination is holding one back? (`claims`)
4. What has Medicare or DVA had longer than three weeks without paying, and what did each rejection actually say? (`claims --status=lodged`, `attention`)
5. Which contact lens wearers have run out of prescription, so the next box cannot be sold until they are seen? (`attention`, `rx-expiring`)
6. What percentage of each optometrist's new spectacle prescriptions became a job here, and who walked out with one? (`capture`)
7. Which jobs are late at which lab, and which finished glasses have waited more than two weeks with money owing? (`jobs`, `attention`)
8. Which glaucoma suspects and diabetic patients are past their review, and which of them can we message rather than call? (`recalls`, `attention`)
9. Which frames have not sold in 90 days and are over a year on the wall, and what are they worth at cost? (`stock --aged`)
10. Which consults have no final examination record, in whose room, and what claim money is each one holding up? (`exams-due`, `claims`)

## Your first hour: ten things to ask for

1. "Walk me through everything on the attention list and what clears each one."
2. "Tom is in tomorrow for tired eyes. Can we bulk bill him, and if not, what are the options?"
3. "Lodge the ready claims and tell me what you held back."
4. "Medicare paid CLM-4001 and CLM-4008 today. Record it."
5. "Arjun saw Daniel on Thursday: healthy eyes, low hyperopia, computer glasses, back in two years. Write it up."
6. "Which diabetic and glaucoma patients are overdue, and who do I call first?"
7. "Order Chloe's glasses: the Tom Ford, single vision 1.6, Prism Lens, $695 with $200 down."
8. "What is our capture rate this quarter, by optometrist?"
9. "Which frames should go back to the supplier?"
10. "Import our patients from Optomate, dry run first." 

## Architecture

```
optometry-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/practice.mjs      the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  views.json documents.json the dashboards and documents, as SQL
  docs/                     the thesis, the rule book and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Optometry Practice for Claude Code for your practice, brings your Optomate patients, recalls and prescriptions across with the Medicare clock intact, loads your fees, items and frame stock, re-enters the jobs still at the lab, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=optomate)
- Read more: [enterprisedna.co/omni/instead-of/optomate](https://enterprisedna.co/omni/instead-of/optomate?utm_source=github&utm_medium=readme&utm_campaign=optomate)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
