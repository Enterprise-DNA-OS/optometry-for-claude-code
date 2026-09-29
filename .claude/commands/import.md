---
description: Bring the practice across from Optomate - the patient list with each patient's last consult and item (so the Medicare clock is right from day one) and their recall, plus prescriptions. Dry-run first, idempotent, every skipped row named. Marketing consent is never assumed.
---

1. In Optomate, run a patient list report that includes name, date of birth, contact details, Medicare number, health fund, last consult date, last item number and recall date and type, and save it as CSV. If your version can export prescriptions, save those too. docs/replace-optomate.md has the column names the importer understands.
2. Dry run first, always: `node scripts/practice.mjs import optomate --patients=Patients.csv [--prescriptions=Prescriptions.csv] --dry-run`. Read out what would be created, matched and skipped, with reasons.
3. Fix what it names, then run it without `--dry-run`. Run it twice and the second pass creates nothing.
4. Say the honest things out loud: every imported patient arrives with the marketing question unanswered; the old examination records stay in the Optomate export (only the last consult's date and item come across, so the Medicare clock is right); open jobs at the lab and unpaid claims are finished in Optomate or re-entered by hand.
