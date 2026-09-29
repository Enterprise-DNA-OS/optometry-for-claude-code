---
description: Prescriptions - see a patient's, record a new spectacle or contact lens prescription with its expiry, and release a copy to the patient (marked EXPIRED if it has lapsed).
---

1. See them: `node scripts/practice.mjs rx "Name" --json`.
2. Record one: `rx add "Name" --kind=spectacle --right="-1.25 -0.50 x180" --left="-1.00" [--add=2.00 --pd=62]`. A contact lens prescription needs `--kind=contact-lens --lens="brand, base curve, diameter, modality"`. Expiry defaults to 24 months (spectacles) or 12 (contact lenses) from settings; `--months=` or `--expires=` to change it. The earlier one of the same kind is superseded.
3. A patient asks for their prescription: `rx release RX-...`, then `npm run docs -- prescription` renders the printable copy. They are entitled to it, and a lapsed one is marked EXPIRED.
4. Never change the powers the optometrist wrote. If a number looks wrong, ask.
