# Best Laid Plans

A classroom game about forecasting. Students run a 200-unit production contract with
a 12-week deadline and forecast the week the customer accepts it.

The dashboard counts units built, so its pace looks precise: on the live 1.1.0 build,
19.1 a week (about 10.5 weeks); on this branch, 20.6 a week (about 9.7). The customer
counts units that pass inspection, and the record of 40 past contracts on the same
line says the work takes longer: 12 to 17 weeks on 1.1.0, 11 to 23 here, where some
past contracts ran out of money. The lesson:
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
2. Each student opens the briefing. Its front tab, **Your Plan & Prediction** (the
   highlighted first tab), holds only the inputs: the plan (crews added at the start,
   inspection, second shift), then the forecast (the acceptance week, an 80% range
   and the chance of week 12), then the commit button. The forecast starts unset, so
   there is no default to anchor on: each number has to be set, or taken from a tool
   with "Use this", before the commit button works. Tapping a slider counts as setting
   it. The sliders stop at week 22, the last week before the customer terminates. One
   line above the commit button explains the three scores. The contract, its rules
   and the line's history are in the tabs:
   - **The Contract** (second) has the terms, every disclosure and the three scores;
   - **Last 5 Contracts** has the last contract's six-week pace and its story;
   - **Records** has all 40 past contracts.
3. Before committing they may open any of the tool tabs (below), or none. Every tab is
   always open, with no limit. The game records which tabs were opened each week, for
   the reveal's "How you played"; it never acts on that. Each
   tool computes a forecast from what the briefing shows and nothing else. Like real
   tools, the tabs carry no labels about what they can and can't see; the reveal
   lists that for each one. "Use this on my prediction" copies a tool's numbers
   into the front tab, where they can still be edited.
4. They play week by week. The same tab strip stays open, every tab visible (it wraps
   into rows on a phone). Its first tab, the highlighted **This Week's Decisions**
   (crews, shift, inspection, the running forecast and "Play week N"), opens each
   week, and switching to a tool and back keeps unsaved choices. Week 1 starts from
   the committed plan: its crews, inspection and shift are already set, and the plan
   stays on screen as a reminder. The tools are recomputed each week from what the
   screen shows (the dashboard, the crews, the spend and the week's events) and from
   this week's decisions. Only the student moves the running forecast; when the
   calendar overtakes it (a week that has passed), the screen says what it moved. "Use this" updates the
   running forecast (week, range and chance). The forecast committed before week 1
   remains the one that is scored. The contract ends when the customer accepts it,
   when the customer terminates it after week 22, or when the company goes bankrupt.
5. At the end the finish screen states what happened ("Accepted in full in week 14.",
   or bankrupt, or terminated, never delivered) and holds the results until the class
   reveals together. The reveal is ordered for a phone:
   1. one lesson line: "Your dashboard said week X. The past contracts said week Y. It
      was accepted in week Z." (X is the week the dashboard first read 100%, Y the
      delivered past contracts' median);
   2. the three scores, each with one plain sentence: whether the week-1 range held,
      "You gave 35% to week 12; it wasn't made", lateness and spend;
   3. how every tool on the desk would have done, each with a line on what it sees and
      can't see, and the failures under any range from the record;
   4. their range against the record, in one compact chart;
   5. what the dashboard told them ("first passed 90% in week N (it read 96%)");
   6. under **More detail**: the forecast's trajectory and the week it first came
      within a week of the outcome; **How you played** in three sentences ("You
      checked tools in N of M weeks." "You changed your forecast N times (first in
      week X)." "After week K you changed nothing."); whether week 1 ran as the plan
      stated and how many later weeks changed it; the tabs opened before committing
      and whose numbers they committed. For hands-off play it adds the record of past
      managers who coasted. None of it changes a score, and the tracking never changes
      an outcome.
6. Ask the room: whose range held? Who was late? Who said 50% or more for week 12,
   and who made it? Who used a tool, and which? Who changed nothing after week 6? Who
   never moved their forecast?

`?tab=analytics` opens the briefing on one tab and `?plan=31n` pre-states a plan,
for projecting a tab in class.

## The rules students are told

- 200 units by week 12, with 4 crews and a $4.60M budget. Each crew costs $50k a week.
- **Crews.** Add up to 3 a week ($100k each, 9 at most) or release one ($50k). New
  crews work at 50% for their first 2 weeks. Each crew beyond 4 costs every crew 4%.
- **Second shift.** +30% output for $20k per crew. From the second straight week,
  tired crews make more defects; a week without it resets the count.
- **Inspection.** Move 0–30% of the line from building to checking. Defects found
  early cost one unit to fix; any the customer's acceptance test finds cost double.
- Some built units turn out defective. The dashboard counts them complete until
  inspection or the acceptance test finds them.
- Customers add to the requirement once, partway through, at a week and by an amount
  nobody knows in advance.
- The customer terminates the contract if it is not accepted by the end of week 22.
- **Contracts differ.** Some lines build faster or slower and turn out more or fewer
  defects; each week's output and inspection finds show how this one runs. In any
  week the line inspects, the inspectors also report the share of that week's units
  their sample found defective. The sample reads the true defect rate with about 8%
  relative error, drawn from the scenario code before play; it changes what the screen
  says, never what happens. A careful reader can narrow the forecast from week 2.
- **Personal luck.** Everyone on a code shares the contract: the scope change, the
  events, how fast and defect-prone the line is, the record and the last contract.
  Each student's line also has its own week-to-week luck, in output (about 7%) and in
  the share of built units that turn out defective (about 10%), persisting from week to
  week. It comes from a stream seeded by the code plus a draw made once, at commit, so
  the world is fixed before play and forecasts never change outcomes. On one code a
  good plan sometimes fails and a reckless one sometimes wins: judge the decision, not
  the outcome. The Contract says: "Your line also has its own week-to-week luck."
- **Events.** About half of contracts lose a crew for 2 weeks (still paid), somewhere
  in weeks 3–9. About 40% hit a parts delay that idles half the line for a week, in
  weeks 4–10. Both are drawn from the scenario code before play.
- **Bankruptcy.** The company can overspend the budget by up to $0.5M on credit. If a
  week's payroll would take it past that, it can't pay its crews: it goes bankrupt
  and the contract ends. During play, a warning appears before a week that would do
  this.
- Scores: **Forecast** = 100 − 8 × |outcome − point| − 20 if the range missed − 40 ×
  Brier score of the week-12 chance, for the forecast committed before week 1.
  **Updating** scores each forecast in force during play as 100 − 8 × |error| − 3 ×
  the interval score of its 80% range − 40 × Brier (the Brier only while week 12 is
  still possible), averaged with week w weighted w + 1, so later forecasts count more.
  The interval (Winkler) score is the range's width plus 10 × how far the outcome
  falls outside it: narrow ranges that hold score best. **Delivery** = 100 − 12 per week late − 1 per
  $50k over budget, or 0 if the contract was terminated or the company went bankrupt.
  A terminated or bankrupt contract's outcome is the week it would have taken at the
  final pace, and it misses every range, on the reveal and in the Forecast score.

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
  defects found, the inspectors' sample, units rejected, scope added and reported
  percentage, plus spend and budget.

No tool reads the scenario's hidden draws. The tests check this, including by changing
every hidden draw mid-game and confirming that no weekly tool's output moves.

Colours:
- blue: inside-view tools;
- amber: record-based tools;
- violet: people and mixed tools;
- red: only the deadline, rejected units, a red status light and bankruptcy.

| Tab | Clones | Sees · can't see |
|---|---|---|
| **The Brief** | | |
| The Contract | contract summary card: the terms (200 units, week 12, 4 crews, $4.60M), every disclosure (acceptance test, termination after week 22, credit line and bankruptcy, scope changes, defects), what you decide each week with its costs, and both scores. No forecast | The contract, every rule and both scores · how long it will take |
| **Dashboards** | | |
| Status Report | status report: a red/amber/green light that flags schedule or cost, in plain words (schedule efficiency, below 1 = behind plan; cost efficiency, below 1 = over budget for the work done; projected finish, 12 weeks ÷ schedule efficiency), the current scope, money tiles (spent, budget left, credit left, cost efficiency; before week 1 the plan's cost), when the money would run out, a burn-up chart; during play, units built per crew, the inspectors' sample and defects found so far. The standard abbreviations (SPI, CPI, EAC) appear only in small grey text | Progress and money: units reported complete against plan, spend, the credit line · whether those units will pass acceptance |
| Schedule | Gantt chart: task bars, milestones, finish diamond | Your plan, week by week, under the stated rules · defects or scope changes |
| **People** | | |
| Team Chat | workplace chat in which five colleagues answer "When will we be done?" (reasoning on tap), updated each week. In order: Dana (line supervisor) from the pace, with a hedge; Sam (planner) from the plan re-planned from now; Kim (sales) from the promise; Mabel, a veteran on the line, from the record; Priya (quality) from rework, the last contract's or this one's, quoting the inspectors' sample | Five colleagues, each from where they sit · which view to weigh most |
| Ask an AI | a plain-text prompt to copy into any AI assistant. It always holds the contract and its rules, the stated plan and, during play, the dashboard week by week. It adds only the tool tabs the student has opened (this week, or before commit): their content, such as the last six weeks, the last 5 contracts or all 40 contracts. The tab lists what's included: "Your AI knows only what you've looked at."  It asks for a forecast, an 80% range and the chance of week 12 with reasoning, and says nothing about which information matters (about 3,000 characters before week 1, 3,500 during play). The tab gives no forecast of its own, and whether the prompt was copied is recorded | Whatever you paste in · anything not on screen |
| **History** | | |
| Last 5 Contracts | the last contract's first six weeks and its pace (19.1 a week, 10.5 weeks to 200 units), an after-action review of it, and a list of the five newest contracts. These are records #36–40; #40 is the line's last contract | The five newest contracts, and the story of the last one · whether five is enough |
| Records | historical-project database: a dot strip of the 40 past contracts with its summary (median, 10th–90th, on-time share), above a sortable, filterable table with "Contracts run like my plan" | What actually happened, defects and scope changes included · plans no past manager tried |
| **Models** | | |
| Analytics | BI dashboard: KPI tiles, scatter of past contracts, fitted OLS line, 80% prediction interval | The record's patterns · plans the record does not contain |
| Risk Simulator | Monte Carlo schedule-risk tool: histogram, S-curve, P10/P50/P80/P90, with a switch for historical rework (on by default). With it on, each run adds a slip drawn from past contracts; with it off, the tool sees only the plan | Variability, scope changes and, if switched on, rework from the record · anything its switches leave out |

`npm run plan` also checks that set-and-forget loses:
- a screen-only adaptive manager (`tools/adaptive-policy.mjs`) is on time at least as
  often as the best static plan;
- every static plan on time 30% or more goes bankrupt at least 20% of the time,
  while the adaptive manager stays at or under 5%;
- four scripted student types (anchor, record-and-coast, AI-and-coast, adaptive)
  compare on the Updating and Delivery scores.

It pins the desk's hold rates across 1,000 codes:
- the tools that use the record (Records, Analytics, Mabel) hold at least 80% of the
  time;
- the pace and the plan on paper (Status Report, Schedule, Sam, the
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

With the desk build's rules (a $4.60M budget, new-crew onboarding, wider contract
differences and the events) the record has:
- 8 of 40 never delivered (8 bankrupt, none terminated), listed and counted as such;
- among the 32 delivered, a median of week 15 and a 10th–90th percentile range of
  weeks 11–19;
- 7 of 40 on time.

The acceptance test rejects whole units, each taking 2 units of work to fix, so its
message always adds up ("6 units rejected. Fixing them this late takes 12 units of
work."). Moving to whole units moved the record from a median of 14 and 8 of 40 on
time to 15 and 7 of 40.

Every median, range and percentile on the desk is computed from delivered
contracts only. This covers the Records summary, the dot strip, Last 5, Mabel,
Analytics, the matching and the simulator's historical slip. On-time shares are out
of all contracts, with a failure counting as not on time. The screen says so.

Delivered-only ranges flatter risky plans, so every range from the record shows its
failures beside it, for example "Contracts run like yours: delivered weeks 11–13; 1 of
7 run like yours never delivered (1 bankrupt)". This holds on the Records summary and
filters, the dot strip (an ✕ per failure), Last 5, Mabel's line, Analytics, the Risk
Simulator's slip pool and the reveal. "Use this" carries the failures into
the week-12 chance (a failure is not on time) and into a note on the front tab.
Analytics and the Risk Simulator scale their chance by the failure share of the
contracts they draw on.

The last contract (#40) read 100% in week 12 and was accepted in week 16, with 21
units rejected. Its first six weeks averaged 20.6 a week. Live 1.1.0 and Monday's
lecture keep the earlier figures: 19.1 a week; 13 → 17 with 19 rejected; median 14;
12–17; 6 of 40.

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
