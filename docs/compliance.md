# The rules this practice lives under

`/compliance` (the CLI's `compliance` command) checks the records against these rules. Each rule names its source. Nothing here is legal or billing advice: this doc records the rules the operator has told the system to enforce, and the check reports what the data says.

The demo practice is in Victoria, Australia, because Optomate's home market is Australia and Medicare is where an optometry practice's rules bite hardest. A New Zealand practice keeps the prescription, record and supply rules and swaps the Medicare items for its own funders (see the note at the end).

The Medicare Benefits Schedule changes, usually in March, July and November. When it does, update this doc and `itemProblem()` in `scripts/practice.mjs` together, and `npm test`.

## records: every consult has a finalised examination record

Every completed consult gets an examination record, finalised within the window in settings (`exam_due_days`, default 2 days). Once final, a record is never edited: corrections are dated addenda. The database refuses an update to a final record with a trigger, so nothing gets round it.

- Optometry Board of Australia, *Code of conduct* (health records: accurate, up to date, contemporaneous).
- Health Records Act 2001 (Vic), Health Privacy Principle 4 (data security and retention: 7 years from last entry for adults, until age 25 for a child).
- Breach: a row in `v_exams_due` older than `exam_due_days`.

## medicare-items: comprehensive items billed inside their rules

The gate in `complete` refuses a comprehensive item the patient is not eligible for, and the check re-runs the rule over every billed consult in the last three years.

- Item 10910: a comprehensive initial consultation for a patient under 65, payable once in 36 months, and not if the patient has had a 10905, 10907, 10910, 10913, 10914 or 10915 in that period.
- Item 10911: the same for a patient 65 and over, once in 12 months.
- Items 10913 (a significant change in visual function, or new signs or symptoms; item 10912 merged into it on 1 March 2025) and 10914 (a progressive disorder): payable inside the interval with the clinical reason recorded. The CLI refuses them without `--reason`.
- Item 10915: the examination with dilation of a patient with diabetes. The CLI refuses it for a patient not recorded as diabetic, and refuses to finalise it without dilation recorded.
- Items 10916 and 10918: short and review consultations, not checked against the interval.
- Sources: MBS Online, optometry items (mbsonline.gov.au, items 10910, 10911, 10913, 10914, 10915); Department of Health, *Implementation of MBS Review Taskforce recommendations to optometry items, 1 March 2025*.
- The limit this system cannot see: consults at another practice. `eligibility` says so every time. Ask a new patient where and when they were last seen.
- Breach: a billed exam whose item fails `itemProblem()` against the exams before it.

## claims: no claim lodged ahead of its examination record

`claim lodge` refuses a claim whose examination is not final. The record is what substantiates the service if Medicare asks.

- Medicare Benefits Schedule, general explanatory notes (records adequate to explain the service).
- Breach: a lodged or paid claim whose examination is not final.

## dva-no-gap: DVA card holders never billed for a consult

A consult for a patient with a DVA number bills DVA. `complete` refuses `--billing=private` for them.

- Department of Veterans' Affairs, *Notes for Optometrists* (the DVA fee is accepted as payment in full; the entitled person is not charged).
- Breach: a patient-payer invoice carrying a Medicare item for a DVA card holder.

## rx-expiry: every prescription carries a reasonable expiry date

Every prescription stores an issue date and an expiry date. Defaults come from settings: 24 months for spectacles, 12 for contact lenses. `rx add` refuses an expiry under 90 days. `rx release` records that a copy went to the patient, and a copy of an expired prescription is marked EXPIRED.

- Optometry Board of Australia, *Guidelines: prescription of optical appliances* (a prescription shows its date of issue and expiry; an expiry must not be unreasonably short; a patient is given a copy on request, and a copy after expiry is marked expired).
- Optometry Australia clinical guidelines: one year is the usual expiry for a contact lens prescription.
- Breach: a prescription whose expiry is less than 90 days after issue.

## supply: spectacles and contact lenses only on a current prescription

`job add` refuses an expired or superseded prescription. `sell` refuses contact lenses without a current contact lens prescription.

- Optometry Board of Australia, *Guidelines: prescription of optical appliances*.
- State and territory law restricting the supply of contact lenses to a current prescription.
- Breach: a job ordered outside its prescription's dates, or a contact lens sale on a date no contact lens prescription covered.

## identity: booked patients carry a date of birth

The Medicare item depends on age, and Medicare checks the patient's details on every claim.

- Services Australia, Medicare claiming (patient identification).
- Breach: an active patient with a booking and no date of birth.

## marketing-consent: messages about buying only go to patients who opted in

A clinical recall is care and goes to anyone with a way to reach them. A message about glasses, lenses or offers only goes to a patient with `marketing_opt_in` true. Imported patients arrive with the question unanswered.

- Spam Act 2003 (Cth): commercial electronic messages need consent.
- Unsolicited Electronic Messages Act 2007 (NZ).
- Enforced in `/draft-recall`, which splits the list and puts everyone else on a call list.

## New Zealand

Keep records, rx-expiry, supply and marketing-consent. Swap the Medicare items for the practice's funders (ACC for eye injuries, the Ministry of Social Development spectacle subsidy, health insurers): change `itemProblem()` and the services through `/customise`. Record retention in New Zealand is at least 10 years from the last care event: Health (Retention of Health Information) Regulations 1996. The optometrist's professional body is the Optometrists and Dispensing Opticians Board.
