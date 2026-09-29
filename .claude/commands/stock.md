---
description: Frames, contact lenses and solutions - what to reorder, what has not moved in a year, and what is on the wall at cost. Receive deliveries and add new lines.
---

1. Run `node scripts/practice.mjs stock --json` (`--low` for the reorder list, `--aged` for frames not moving, `--kind=frame`).
2. Say the reorder list first, then the frames that have not sold in 90 days and are over a year old, with their value at cost: those are the ones to return or price to go.
3. A delivery: `stock receive SKU --qty=N`. A new line: `stock add SKU --kind=frame --brand= --name= --cost= --retail= --qty=`.
