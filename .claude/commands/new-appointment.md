---
description: Book a patient in. The gates speak - working days and hours, double bookings - and the booking warns when the Medicare item it would bill is not claimable yet, with the date it becomes claimable.
---

1. Resolve the patient (`patient NAME --json`); if they are new, `patient add "Name" --dob=YYYY-MM-DD --phone= --medicare=` first. The date of birth matters: the Medicare item depends on age.
2. Pick the service: `CE` (under 65, 10910), `CE65` (65 and over, 10911), `DIAB` (dilated, 10915), `REV`, `SHORT`, `CLFIT`, `CLAC`, `DISP` (collection). `services --json` has the list.
3. Run `node scripts/practice.mjs book add "Name" --service=CE --optometrist=NAME --date=YYYY-MM-DD --time=HH:MM --reason="why they are coming" --json`.
4. If it refuses, say why in one line and offer the fix it names. If it books with a warning about the item, tell the operator now: either the visit is a 10913 (write the reason when it completes) or the patient is told the private fee when they book.
