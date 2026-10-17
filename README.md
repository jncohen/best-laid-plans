# Best Laid Plans

A classroom game about forecasting. Students run a 200-unit production contract with
a 12-week deadline and forecast the week the customer accepts it.

The dashboard counts units built, so its pace (19.1 a week, about 10.5 weeks) looks
precise. The customer counts units that pass inspection, and the record of 40 past
contracts on the same line says the work usually takes 12 to 17 weeks. The lesson:
start from the record of similar cases, then adjust only for differences the record
supports.

Written for DATA 790, Module 05: Imagining, Modeling, and Prediction.

**Play it:** <https://jncohen.github.io/best-laid-plans/>. The live site serves the
`plan-matched-record` branch (version 1.1.0, the build used in class). This README
describes the `decision-desk` branch (1.2.0), which adds the tabbed Decision Desk, a
richer past record and bankruptcy, and drops result codes and the `#room` chart in
favour of a show of hands. It is not live until it is merged into
`plan-matched-record`.

## Running a class session

1. Give the room one scenario code (for example `ledger`). Everyone on the same code
   faces the same contract and the same scope change. A link with `?seed=ledger`
   fills it in.
2. Each student opens the briefing. Its front tab, **Your Plan and Prediction ·
   Commit Before Week 1**, starts with the decision: the plan (crews added at the
   start, inspection, second shift), then the forecast (the acceptance week, an 80%
   range and the chance of week 12). Below that are the contract, the last contract's
   pace and story, the past contracts' range and the rules.
3. Before committing they may open any of the 13 tool tabs (below), or none. Each
   tool computes a forecast from what the briefing shows and nothing else, and says
   what it can and can't see. "Use this on my prediction" copies a tool's numbers
   into the front tab, where they can still be edited.
4. They play week by week. A collapsible **Decision support** bar above the
   prediction holds the same tools, recomputed each week from what the screen shows:
   the dashboard, the crews, the spend and the week's events. "Use this" updates the
   running forecast (week, range and chance). The forecast committed before week 1
   remains the one that is scored. The contract ends when the customer accepts it,
   when the customer terminates it after week 22, or when the company goes bankrupt.
5. At the end the game holds the result until the class reveals together. Each
   student's reveal opens with **Your numbers**, so they can answer a show of hands:
   - whether their 80% range held, and if not, whether it missed late or early;
   - the outcome week;
   - their stated chance of week 12;
   - whether they played the plan they stated (if not, what they said and what they
     played);
   - the tool whose numbers they used, if any, and how many tool tabs they opened.

   Below that, the reveal shows:
   - two plain facts: whether their 80% range held (or by how many weeks it missed,
     late or early), and whether they played the plan they stated. For hands-off play
     it adds the record of past managers who coasted. Neither fact changes a score;
   - their range against the record;
   - the forecast's trajectory week by week, and the week it first came within a
     week of the outcome;
   - how often they opened decision support during play;
   - how every tool on the desk would have done.
6. Ask the room: whose range held? Who was late? Who said 50% or more for week 12,
   and who made it? Who used a tool, and which?

`?tab=analytics` opens the briefing on one tab and `?plan=31n` pre-states a plan,
for projecting a tab in class.

## The rules students are told

- 200 units by week 12, with 4 crews and a $5.00M budget. Each crew costs $50k a week.
- **Crews.** Add up to 3 a week ($100k each, 9 at most) or release one ($50k). A new
  crew slows the whole line to 70% for 2 weeks. Each crew beyond 4 costs every crew 4%.
- **Second shift.** +30% output for $20k per crew. From the second straight week,
  tired crews make more defects.
- **Inspection.** Move 0–30% of the line from building to checking. Defects found
  early cost one unit to fix; any the customer's acceptance test finds cost double.
- Some built units turn out defective. The dashboard counts them complete until
  inspection or the acceptance test finds them.
- Customers add to the requirement once, partway through, at a week and by an amount
  nobody knows in advance.
- The customer terminates the contract if it is not accepted by the end of week 22.
- **Bankruptcy.** The company can overspend the budget by up to $0.5M on credit. If a
  week's payroll would take it past that, it can't pay its crews: it goes bankrupt
  and the contract ends. During play, a warning appears before a week that would do
  this.
- Scores: **Forecast** = 100 − 8 × |outcome − point| − 20 if the range missed − 40 ×
  Brier score of the week-12 chance. **Delivery** = 100 − 12 per week late − 1 per
  $50k over budget, or 0 if the contract was terminated or the company went bankrupt.
  A terminated or bankrupt contract's outcome is the week it would have taken at the
  final pace.

## The Decision Desk

The desk is a realistic project office. Every tool behaves the way its real-world
counterpart does and gives the answer a real one would give with this information.
Good information appears in several forms: the record, the last five contracts, a
veteran's memory, an assistant that reads the whole briefing, a simulator with
historical risk factors. Misleading information appears only where it naturally
occurs: the dashboard's pace, the plan on paper and sales pressure. The skill being
tested is what the student weighs, not finding one honest tab.

The tool tabs are generic replicas of decision-support dashboard genres, never of any
product. Every one is computed in `frontend/src/plan/desk.js` from the screen alone:
- the line's last six weeks;
- the last contract;
- the 40 past contracts;
- the stated rules;
- during play, the dashboard: each week's units built, crews, inspection, shift,
  defects found, units rejected, scope added and reported percentage, plus spend and
  budget.

No tool reads the scenario's hidden draws. The tests check this, including by changing
every hidden draw mid-game and confirming that no weekly tool's output moves.

Colours:
- blue: inside-view tools;
- amber: record-based tools;
- violet: people and mixed tools;
- red: only the deadline, rejected units, a red status light and bankruptcy.

| Tab | Clones | Sees · can't see |
|---|---|---|
| **The mind's own frames** | | |
| Status Report | earned-value status report: red/amber/green light, SPI, CPI, schedule estimate at completion (planned duration ÷ SPI), burn-up chart | Earned value: units reported complete against plan · whether those units will pass acceptance |
| Cost Management | project cost-control dashboard: BAC, EAC, CPI, cash runway, cumulative spend against the budget and the bankruptcy line | Money: spend, burn rate, the credit line · defects, so you can watch every dollar and still be late |
| Schedule | Gantt chart: task bars, milestones, finish diamond | Your plan, week by week, under the stated rules · defects or scope changes |
| **Other people** | | |
| Team Chat | workplace chat in which five colleagues answer "When will we be done?" (reasoning on tap), updated each week. In order: Dana (line supervisor) from the pace, with a hedge; Sam (planner) from the plan re-planned from now; Kim (sales) from the promise; Mabel, a veteran on the line, from the record; Priya (quality) from rework, the last contract's or this one's | Five colleagues, each from where they sit · which view to weigh most |
| Ask an AI | a plain-text prompt to copy into any AI assistant. It holds everything on screen: the contract and every rule, the last six weeks, the last 5 contracts, all 40 contracts, the stated plan and, during play, the week-by-week status. It asks for a forecast, an 80% range and the chance of week 12 with reasoning, and says nothing about which information matters (about 3,000 characters before week 1, 3,500 during play). The tab gives no forecast of its own, and whether the prompt was copied is recorded | Whatever you paste in · anything not on screen |
| **Records and structured judgment** | | |
| Last 5 Contracts | recent-projects list plus an after-action review of the newest. These are records #36–40; #40 is the line's last contract | The five newest contracts, and the story of the last one · whether five is enough |
| Records | historical-project database: the 40 past contracts, sortable and filterable, with "Contracts run like my plan" | What actually happened, defects and scope changes included · plans no past manager tried |
| Scenarios | best / base / base + rework / worst-seen matrix with assumptions | A wider range, on purpose · anything but your plan as the starting point |
| Risk Register | probability × impact heat map with risk cards, and a premortem box ("It's week 17 and the customer has rejected the delivery. Why?"). No forecast | Each risk, one at a time, and your own premortem · their sum |
| **Models** | | |
| Analytics | BI dashboard: KPI tiles, scatter of past contracts, fitted OLS line, 80% prediction interval | The record's patterns · plans the record does not contain |
| Risk Simulator | Monte Carlo schedule-risk tool: histogram, S-curve, P10/P50/P80/P90, with a switch for historical rework (on by default). With it on, each run adds a slip drawn from past contracts; with it off, the tool sees only the plan | Variability, scope changes and, if switched on, rework from the record · anything its switches leave out |
| Consensus | forecast-combination panel: tick the tools to average | The tabs you tick · anything you leave out |
| **Your own record** | | |
| Your Track Record | personal stats from earlier plays on this device | Your past forecasts on this device · anything, if you haven't kept score |

`npm run plan` pins the desk's hold rates across 1,000 codes:
- the tools that use the record (Records, Analytics, Mabel) hold at least 80% of the
  time;
- the pace and the plan on paper (Status Report, Schedule, Cost Management, Sam, the
  Risk Simulator with rework off) hold at most 10%;
- the Risk Simulator with historical rework holds at least 80%.

These rates are for the desk as it stands before week 1. Ask an AI is not swept,
because it gives no forecast of its own.

## The past record

The record is chronological. Contract #40, the newest, is the line's last contract:
the one the briefing describes and the Last 5 Contracts tab reviews. It was run
hands-off.

Contracts #1–39 are run by managers with habits of their own: eight archetypes
(coaster, early hirer, reactive hirer, staged hirer, inspector, shift runner, hire +
shift, quality-first). Each manager's parameters are drawn from a fixed seed (659), so
the record is the same for everyone and on every scenario code. Each manager plays the
same engine week by week and reacts only to what their screen shows: the reported
backlog, crews and week.

The record has:
- a median of week 14, a 10th–90th percentile range of weeks 12–17, and 6 of 40 on
  time, the same figures as the fixed record in 1.1.0;
- 24 distinct plans;
- no manager who went bankrupt. A contract that was never accepted would count as
  later than any delivered one.

The Records table shows, for each contract:
- what the manager did: crews added and when, inspection, second-shift weeks;
- the scope change;
- the week the dashboard read 100%;
- the units rejected at acceptance;
- the outcome: the week accepted, or "Bankrupt" or "Terminated" with the week the
  contract ended.

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
GitHub Pages. `.github/workflows/pages.yml` deploys `plan-matched-record` and
`master`, with `verify` and `plan` as gates.

## Layout

```
frontend/
  src/main.jsx          mounts the game
  src/plan/engine.js    the simulation and the past record; every tunable number is in CONFIG
  src/plan/desk.js      the Decision Desk's tools, computed from the briefing alone
  src/plan/table.js     filtering and sorting for the Records table
  src/plan/track.js     the device-only track record
  src/plan/*.jsx        briefing and desk tabs, weekly play, reveal
  render-check.jsx      server-renders every screen and every desk tab
tools/
  test-plan.mjs         engine and desk tests, including the numbers the lecture quotes
  plan-sweep.mjs        plays each strategy 1,000 times and checks the targets
```

The engine is deterministic for a given scenario code. The past contracts and the
last contract shown in the briefing are produced by the engine itself, not typed in.

## Licence

© 2026 Joseph N. Cohen. Licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See `LICENSE`.
