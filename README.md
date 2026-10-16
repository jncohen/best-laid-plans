# Best Laid Plans

A classroom game about forecasting. Students run a 200-unit production contract with
a 12-week deadline and forecast the week the customer accepts it.

The dashboard counts units built, so its pace (19.1 a week, about 10.5 weeks) looks
precise. The customer counts units that pass inspection, and the record of 40 past
contracts on the same line says the work usually takes 12 to 17 weeks. The lesson:
start from the record of similar cases, then adjust only for differences the record
supports.

Written for DATA 790, Module 05: Imagining, Modeling, and Prediction.

## Running a class session

1. Give the room one scenario code (for example `ledger`). Everyone on the same code
   faces the same contract and the same scope change. A link with `?seed=ledger`
   fills it in.
2. Each student reads the briefing, commits a forecast before week 1 (the acceptance
   week, an 80% range, and the chance of week 12) and plays week by week.
3. At the end the game holds the result until the class reveals together. Each
   student then has a result code.
4. Open `#room` on the projector (for example `…/index.html#room`) and enter the
   codes. It shows how many ranges held, how many forecasts ran late, and each
   student's range against the past contracts.

## Development

Requires Node 20 or later.

```bash
cd frontend
npm install
npm run dev       # local server at http://localhost:5173
npm run verify    # lint, engine tests, render checks, production build
npm run plan      # strategy sweep against the game's balance targets
npm run build     # static site in frontend/dist/
```

`vite.config.js` sets `base: './'`, so the build works from any subpath, including
GitHub Pages.

## Layout

```
frontend/
  src/main.jsx          routes: the game, or #room
  src/plan/engine.js    the simulation; every tunable number is in CONFIG
  src/plan/*.jsx        briefing, weekly play, reveal, room chart
  render-check.jsx      server-renders every screen
tools/
  test-plan.mjs         engine tests, including the numbers the lecture quotes
  plan-sweep.mjs        plays each strategy 1,000 times and checks the targets
```

The engine is deterministic for a given scenario code. The past contracts and the
last contract shown in the briefing are produced by the engine itself, not typed in.

## Licence

© 2026 Joseph N. Cohen. Licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See `LICENSE`.
