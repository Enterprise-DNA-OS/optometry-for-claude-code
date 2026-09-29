---
description: Prescriptions about to expire, or lapsed in the last 60 days, with nothing booked - the patients to book before they buy glasses elsewhere.
---

1. Run `node scripts/practice.mjs rx-expiring --json` (`--days=N` to widen it).
2. Contact lens prescriptions first: an expired one stops the next box being sold. Then spectacles.
3. Offer `/draft-recall` for those who opted in, and a call list for the rest.
