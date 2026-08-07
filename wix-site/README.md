# Wix Velo port (Phase 2, in progress)

This mirrors the Velo file layout for the "Wall Street Valuation Lab" Wix Studio site
(meta-site ID `a8df27f5-af54-452a-b6af-fb7446448524`).

- `backend/valuation/*.js` — byte-identical copies of `../src/engine/*.js`. Verified with
  `diff -r` against the tested engine before committing; no formulas were touched.
- `backend/valuationApi.web.js` — thin `@wix/web-methods` wrappers (`webMethod(Permissions.Anyone, ...)`)
  exposing `runWaccCalculation`, `runScenarioValuation`, `runReverseDcf`, `runSensitivityTable`
  to page code. No calculation logic lives in this file.

## To finish the port once Git Integration is connected

1. In the Wix Studio Editor: Dev Mode → connect the site's GitHub repo (your manual step).
2. Copy `backend/` from this folder into the repo's `backend/` folder (same relative paths).
3. Add a "Valuation Lab" page in the Editor with input elements + a results area (text boxes,
   a button, a table/repeater) — tell me the element IDs (or share the repo) and I'll write the
   page code (`import { runScenarioValuation, ... } from 'backend/valuationApi.web';`) to wire
   them to these web methods, mirroring `public/app.js`'s logic exactly.
4. Publish, then browser-test against the same Base Case used in `test/engine/integration.test.js`.

If you'd rather I drive step 3 with Chrome automation once the page exists, say so and I'll
attempt element placement — flagged in Phase 2 planning as the least reliable part to automate.
