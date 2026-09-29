# Moving from Optomate

This guide covers getting your records out of Optomate and into Optometry Practice for Claude Code. Run the free version with the demo data first (`npm run demo`) so you know what you are moving to.

## What you export

Optomate does not publish a single "export everything" button, and the exact menus differ between Optomate Touch and Optomate.Net. What every version has is reports that print to a file:

1. **A patient list.** Use the patient list or marketing list report with no filters (so it returns every active patient), and include these columns if your version offers them: given name, surname, date of birth, mobile, email, address, Medicare number, health fund and member number, DVA number, last consult date, last item number, recall date and recall type. Save it as CSV (or save it as Excel and then as CSV).
2. **Prescriptions, if you can.** A report of prescriptions with patient name, type (spectacles or contact lenses), date, the powers for each eye (sphere, cylinder, axis, add) and PD. If your version cannot produce one, the current prescription is re-entered at each patient's next visit.
3. **Keep the full export.** Ask Monkey Software for a full data export when you give notice. That file is your retention copy of every old examination record: it is kept for the retention period whatever system you use next.

If Optomate is connected to a reporting tool through its API, the same columns can come from there.

## What the importer understands

`node scripts/practice.mjs import optomate --patients=Patients.csv [--prescriptions=Prescriptions.csv] --dry-run`

Column names are matched without caring about case, and the common variants are all read:

| Field | Column names read |
|---|---|
| Name | Given Name + Surname, First Name + Last Name, or Patient Name |
| Date of birth | Date of Birth, DOB, Birth Date (DD/MM/YYYY or YYYY-MM-DD) |
| Phone, email | Mobile, Phone, Home Phone, Email |
| Medicare, fund, DVA | Medicare No, Medicare Number, Health Fund, Health Fund No, Fund No, DVA No |
| Last consult | Last Consult, Last Consultation, Last Exam, Last Visit (with Last Item or MBS Item) |
| Recall | Recall Date, Next Recall, Recall Due (with Recall Type or Recall Reason) |
| Prescription | Patient Name, Type, Date, R Sph, R Cyl, R Axis, L Sph, L Cyl, L Axis, Add, PD, Expiry |

## What carries over

- **Patients**, matched by name and date of birth, so re-running never duplicates anyone. An existing patient's blank fields are filled; nothing already there is overwritten.
- **The Medicare clock.** Each patient's last consult date and item come across as a short imported record, so `eligibility` knows when 10910 or 10911 is claimable again from day one. Without this, the first bulk-billed consult for every returning patient is a guess.
- **Recalls**, with their due date and type.
- **Prescriptions**, with an expiry date (24 months for spectacles and 12 for contact lenses when the export has none). Older prescriptions of the same kind are marked superseded.

## What does not, and why

- **Marketing consent.** Every imported patient arrives with the marketing question unanswered. A spreadsheet column is not consent. Ask at the next visit.
- **Old examination records.** They stay in the Optomate export, your retention copy. Re-typing years of clinical notes into a new system adds risk and no value.
- **Jobs at the lab and unpaid claims.** Finish them in Optomate, or enter the few still open by hand (`job add`, and claims through `complete` on the next visit). The importer does not guess at money.
- **Stock.** Do a stock take on the day you switch and enter it with `stock add`: it is quicker than cleaning an export and it is right.
- **Equipment integrations and ePrescribing.** Optomate connects to some testing equipment and to Parchment for ePrescribing. The free version does not; connecting them is part of what Enterprise DNA builds when it installs your version.

## The switch, in one day

1. Morning: export from Optomate. `import optomate ... --dry-run`, fix what it names, then import for real.
2. Load your fees and items: `/customise` ("our comprehensive consult fee is $X").
3. Add the team (`optometrist add`), the frames on the wall (`stock add`), and the jobs still at the lab (`job add`).
4. Run `/attention` and `/compliance`, then book tomorrow's patients in the new system.
5. Keep Optomate read-only for a month for anything you forgot, then close it.

Enterprise DNA does all of this for you, including the lab jobs, open claims and the stock take, when it installs Optometry Practice for Claude Code: https://enterprisedna.co/omni/instead-of/optomate
