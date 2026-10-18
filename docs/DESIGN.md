# Best Laid Plans: design notes

For players and instructors, see the [README](../README.md). This file is for whoever maintains the game.

A classroom game about forecasting. Students run a 200-unit production contract with
a 12-week deadline and forecast the week the customer accepts it.

The dashboard counts units built, so its pace looks precise: 18.6 a week on ledger (about 10.8
weeks). The customer counts units that pass inspection, and the record of 40 past
contracts on the same line says the work takes longer: on ledger, weeks 13 to 18 for
most of the 38 delivered, and 2 of the 40 ran out of money. The lesson:
start from the record of similar cases, then adjust only for differences the record
supports.

Written for DATA 790, Module 05: Imagining, Modeling, and Prediction.

**Play it:** <https://jncohen.github.io/best-laid-plans/>. The live site serves
`master`. These notes describe `simple-1.2`, the
simplified 1.2 for class: ten tabs (with a small management-information system), one forecast score, the richer past record with
its failures shown, personal luck, bankruptcy, and a show of hands instead of result
codes. The full 1.2 (more tools, an Updating score, mid-game events, the inspectors'
sample) is on `decision-desk`.

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
3. There is no gut stage: every tab is open from the start, and the student makes one
   forecast. Nothing has to be clicked through: the commit button needs only the plan
   and the forecast ("Every tab is open. What you check before you commit is up to
   you."). Being informed is the student's job, and the game counts how often they
   looked. Once Team Chat, Last 5 Contracts and Records have all been opened, a
   comparison card lists, in a fixed order, the Status Report, each colleague in Team
   Chat, Last 5 and Records for plans like theirs, each with its week, 80% range and
   chance of week 12 (and, for Records, its failures and a note when the match is
   loose). Under it: "These disagree by N weeks. Pick one to use, or set your own." No
   row is marked right. The plan's projected cost is shown too: "This plan costs about
   $X by week N … Money lasts to week M at this spend." The committed forecast is the
   one scored.
   **Team Chat** says each colleague's approach beside their name (Dana goes by the
   pace of the line; Sam by the plan on paper; Kim by what the customer was promised;
   Mabel by the record of past contracts; Priya by defects and rework), and every
   colleague updates after each week of play with that week's numbers.
   **Management information.** Three tabs work like a project office's own system.
   None gives a forecast, and none changes the game.
   - **Project Controls** (Dashboards): a burn-down (units left each week, from the
     dashboard, against the straight line to zero at week 12, with the Schedule's
     projection) and a defect control chart (defects found each week, with a c-chart
     centre line and upper limit, mean + 3√mean, from the weeks before any acceptance
     test). An acceptance-test week usually lands above the limit: the defects were
     there all along. Before week 1 it shows the last contract's first six weeks.
   - **What-if Planner** (Dashboards): the student's plan beside two options they set
     (crews, inspection, shift), each priced on paper: when the dashboard would read
     100%, the cost to finish, and whether the money lasts. Before week 1 each row also
     shows the past contracts run like it (median, range, how many, and "loose" when
     the match is). During play the options run from next week, and crews can only be
     added.
   - **Risk Register** (Your notes): the student logs risks before or during play
     (the customer adds a lot of work; defects found late; the money runs out; the line
     runs slower than planned; late delivery; something else), each with a likelihood
     and an optional note. It is recorded, never acted on. The reveal lists each risk
     and whether it happened, and the risks that happened without being logged; the
     results file includes it.
   **Ask an AI** holds a plain prompt to copy into any AI assistant: the contract and
   its rules, the last contract's first six weeks, the student's plan and, during play,
   the dashboard week by week. It holds no past contracts: **Records** has a
   **Download the records (.csv)** button (all 40 contracts, one row each, failures
   included) for a spreadsheet or to upload to the AI, if the student thinks to. The
   prompt ends with one question, "When will the customer accept the contract?", and
   says nothing about method. Getting a good answer is up to the student. The tab
   gives no forecast of its own.
   Before committing they may open any of the open tool tabs, or none. Every tab is
   always open, with no limit. The game records which tabs were opened before
   committing, for the reveal; it never acts on that. Each
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
   On a desktop both screens have two panels: the student's own inputs always on the
   left (the plan and forecast before week 1; the forecast and decisions during play)
   and the information on the right (the tab chosen, or by default The Contract or the
   comparison card before week 1, and the dashboard during play: a row of KPI tiles,
   the progress and forecast charts and the week's events). On a phone the tabs switch
   the whole screen, as before, with the KPI row first on This Week's Decisions.
   **Keep/Change checkpoints.** After the scope change, the dashboard first passing 90%,
   an acceptance rejection (one card a week at most) and the first time the money runs
   out before the forecast, a card states what happened and the current forecast, and
   the next week stays locked until the student taps **Keep forecast** or **Change
   forecast** (which opens the range sliders). Each tap is logged with its week and
   event; the reveal's facts report "You saw it, and you kept / changed your forecast".
   This one card is the only alert at the top: it shows in the week the event happened,
   and goes once tapped. A typical game adds 3 to 5 taps: one each for the scope change
   and 90%, one or two rejections, and sometimes the money.
   The events also stay in the week's log: "The customer added 15 units
   in week 4." and "Customer acceptance test: 17 units rejected. Fixing them now takes
   34 units of work." The progress chart marks the week the dashboard first passed 90%
   ("Dashboard: 90% done"). The KPI row also says "Money lasts to week N at this spend", in red when that is
   before the student's forecast, and warns a week before payroll would go past the
   credit line.
5. At the end the finish screen states what happened ("Accepted in full in week 14.",
   or bankrupt, or terminated, never delivered) and holds the results until the class
   reveals together. The reveal opens with **Your game in 9 facts**, numbered so the
   instructor can ask "hands up if fact 3 happened to you":
   1. your plan: what you planned, whether week 1 ran as planned, how many later weeks
      you changed your decisions, and the crews and inspection you finished with (for
      "What was your plan?");
   2. your starting point: the forecast, and whether it is close to the line's pace, the
      past contracts' median, the deadline, or your own number;
   3. what you checked: how many times you opened an information source before week 1
      (repeats count) and whether that included Records and Last 5 Contracts; how many
      checks during play and in how many weeks; whether you "checked out" (two or more
      weeks at the end without a look: "you stopped checking after week 6"); and your AI
      use (opened Ask an AI, copied its prompt, downloaded the records);
   4. the week the dashboard passed 90% (its peak reading that week: 100% in a week
      whose acceptance test rejected units), the units the customer then rejected, and
      whether you changed your forecast within 2 weeks of the rejection;
   5. the scope change against the record's spread (+10 to +52), and whether you
      changed your forecast within 2 weeks (only your own moves count, not the
      calendar's);
   6. whose numbers you committed (Mabel's, the Records numbers, or your own and the
      desk forecast closest to them), and any you used during play;
   7. whether your 80% range held, or by how many weeks it missed;
   8. bankrupt or not (with the payroll that went past the credit line), and any
      overspend;
   9. luck: your exact weekly decisions replayed under 100 other personal-luck draws in
      the same shared world: the typical week and its spread, how many of the 100 you
      were luckier than, and how often week 12 was made, the company went bankrupt and
      your range held. It takes about 2 ms on a laptop, so well under 50 ms on a
      phone.

   Under the facts, **Download my results (.txt)** saves a text file of the run: the
   scenario code, a run number and the date; the plan, forecast and outcome; the
   Forecast score and its parts; the Delivery score; the nine facts; the checks (by week), checking out and AI use; the risk register; and the weeks as a
   CSV. Each finished game on a browser is a new run (`best-laid-plans-ledger-run1.txt`,
   then `run2`), so students can replay and still keep their first play for the class
   discussion. On a phone, the same text can be copied from "Show the text to copy".

   Below the facts the reveal is ordered for a phone:
   1. one lesson line: "Your dashboard said week X. The past contracts said week Y. It
      was accepted in week Z." (X is the week the dashboard first read 100%, Y the
      delivered past contracts' median);
   2. the Forecast score (the score) and the Delivery score (secondary), each with one
      plain sentence: whether the week-1 range held, a note when the range was wide,
      "You gave 35% to week 12; it wasn't made", lateness and spend. A bankruptcy is its
      own line under the lesson;
   3. how every tool on the desk would have done, each with a line on what it sees and
      can't see, and the failures under any range from the record;
   4. their range against the record, in one compact chart;
   5. what the dashboard told them ("first passed 90% in week N (it read 96%)");
   6. under **More detail**: the forecast's trajectory and the week it first came
      within a week of the outcome; whether week 1 ran as the plan
      stated and how many later weeks changed it; the tabs opened before committing
      and whose numbers they committed. For hands-off play it adds the record of past
      managers who coasted. None of it changes a score.
6. Ask the room: whose range held? Who was late? Who said 50% or more for week 12,
   and who made it? Who used a tool, and which? Who changed nothing after week 6? Who
   never moved their forecast?

`?tab=analytics` opens the briefing on one tab and `?plan=31n` pre-states a plan,
for projecting a tab in class.

## The rules students are told

- 200 units by week 12, with 4 crews and a $5.00M budget. Each crew costs $50k a week.
- **Crews.** Add up to 3 a week ($100k each, 9 at most) or release one ($50k). A new
  crew slows the whole line to 70% for 2 weeks (as in 1.1). Each crew beyond 4 costs
  every crew 4%.
- **Second shift.** +30% output for $20k per crew. From the second straight week,
  tired crews make more defects (as in 1.1; a week without the shift resets the count).
- **Inspection.** Move 0–30% of the line from building to checking. Defects found
  early cost one unit to fix; each unit the customer's acceptance test rejects takes 2
  units of work.
- Some built units turn out defective. The dashboard counts them complete until
  inspection or the acceptance test finds them.
- Customers add to the requirement once, partway through, at a week and by an amount
  nobody knows in advance. There are no other mid-game events.
- The customer terminates the contract if it is not accepted by the end of week 22.
- **Contracts differ.** Some lines build faster or slower and turn out more or fewer
  defects (productivity 0.92–1.08, defect-proneness 0.75–1.3, as in 1.1); each week's
  output and inspection finds show how this one runs.
- **Personal luck.** Everyone on a code shares the contract: the scope change, how
  fast and defect-prone the line is, the record and the last contract. Each student's
  line also has its own week-to-week luck, in output (about 9%) and in the share of
  built units that turn out defective (about 15%), persisting from week to week. It
  comes from a stream seeded by the code plus a draw made once, at commit, so the
  world is fixed before play and forecasts never change outcomes. On one code a good
  plan sometimes fails and a reckless one sometimes wins: judge the decision, not the
  outcome. The Contract says: "Your line also has its own week-to-week luck."
- **Bankruptcy.** The company can overspend the budget by up to $0.5M on credit. If a
  week's payroll would take it past that, it can't pay its crews: it goes bankrupt
  and the contract ends. During play, a warning appears before a week that would do
  this.
- **The score is the forecast.** The front tab and The Contract say "Your score is
  your forecast. Delivery shows how the company did." **Forecast** scores the
  commitment made before week 1: 100 − 8 × |outcome − point| − 3 × the interval score
  of the 80% range − 40 × Brier of the week-12 chance, floored at 0. The interval
  (Winkler) score is the range's width plus 10 × how far the outcome falls outside it,
  so a wide range costs points even when it holds. With a 20% chance of week 12 and
  the point mid-range: on an outcome of week 15, 12–17 scores 75, 6–24 scores 44 and
  10–11 scores 0; on week 13, 75, 28 and 11–19. **Delivery** (secondary) = 100 − 12
  per week late − 1 per $50k over budget, or 0 if the contract was terminated or the
  company went bankrupt. A contract never delivered (bankrupt or terminated) misses
  its range and scores 0; the reveal says so, and reports the bankruptcy on its own
  line ("Your company went bankrupt in week N"). The reveal shows the score's three
  parts: 100 − point − range − chance.

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
| **The Brief** | | |
| The Contract | contract summary card: the terms (200 units, week 12, 4 crews, $5.00M), every disclosure (acceptance test, termination after week 22, credit line and bankruptcy, scope changes, defects), what you decide each week with its costs, and both scores. No forecast | The contract, every rule and both scores · how long it will take |
| **Dashboards** | | |
| Status Report | status report: a red/amber/green light that flags schedule or cost, in plain words (schedule efficiency, below 1 = behind plan; cost efficiency, below 1 = over budget for the work done; projected finish, 12 weeks ÷ schedule efficiency), the current scope, money tiles (spent, budget left, credit left, cost efficiency; before week 1 the plan's cost), when the money would run out, a burn-up chart; during play, units built per crew and defects found so far. The standard abbreviations (SPI, CPI, EAC) appear only in small grey text | Progress and money: units reported complete against plan, spend, the credit line · whether those units will pass acceptance |
| **People** | | |
| Team Chat | workplace chat in which five colleagues answer "When will we be done?" (reasoning on tap), updated each week. In order: Dana (line supervisor) from the pace, with a hedge; Sam (planner) from the plan re-planned from now; Kim (sales) from the promise; Mabel, a veteran on the line, from the record; Priya (quality) from rework, the last contract's or this one's | Five colleagues, each from where they sit · which view to weigh most |
| Project Controls | a burn-down of units left against the plan line, and a defect control chart (c-chart limits from the weeks before any acceptance test) | Units left and defects found · defects no one has found yet |
| What-if Planner | the plan engine and the money for the student's plan and two options, side by side; before week 1, the record for plans like each | What other plans would cost and finish on paper · defects and the scope change |
| Risk Register | the student's own list of risks and likelihoods, judged at the reveal | The risks the student logs · the ones they do not think of |
| Ask an AI | a plain prompt (the contract, the last contract's first six weeks, the plan and, during play, the dashboard) to paste into any AI assistant, ending "When will the customer accept the contract?"; no method hints and no forecast of its own | Whatever the student asks it · how to question an AI about a forecast |
| **History** | | |
| Last 5 Contracts | the last contract's first six weeks and its pace (18.6 a week on ledger, 10.8 weeks to 200 units), an after-action review of it, and a list of the five newest contracts. These are records #36–40; #40 is the line's last contract | The five newest contracts, and the story of the last one · whether five is enough |
| Records | historical-project database: a dot strip of the 40 past contracts with its summary (median, 10th–90th, on-time share), above a sortable, filterable table with "Contracts run like my plan" | What actually happened, defects and scope changes included · plans no past manager tried |

`npm run plan` also checks the money and the luck:
- the best plan (highest mean Delivery) goes bankrupt at most 5% of the time, and +2
  crews with a second shift every week at least 90%;
- a screen-only adaptive manager (`tools/adaptive-policy.mjs`) is on time at least as
  often as the best static plan and beats record-and-coast on Delivery;
- on one code (ledger), across 400 personal-luck draws, good plans are late or
  bankrupt at least 30% of the time, a reckless plan (+3 crews, no inspection) is on
  time at least 5%, and the adaptive manager beats flat out on Delivery by 20 points or
  more.

It pins the desk's hold rates across 1,000 codes:
- the tools that use the record (Records, Mabel) hold at least 80% of the time;
- the pace and the plan on paper (Status Report, Sam) hold at most 10%.

## The past record

The record is chronological. Contract #40, the newest, is the line's last contract:
the one the briefing describes and the Last 5 Contracts tab reviews. It was run
hands-off.

Contracts #1–39 are run by managers with habits of their own: eight archetypes
(coaster, early hirer, reactive hirer, staged hirer, inspector, shift runner, hire +
shift, quality-first). Each manager's parameters are drawn from a fixed seed (659), so
every code has the same mix of managers. **Each scenario code draws its own record**:
the 40 contracts and the last contract (#40) are played under the code's own draws
(lines, luck, scope changes), with the same rules. So the record, Last 5, Mabel and
every number read from them differ a little from code to code, while everyone on one
code sees the same record. `node tools/record-by-code.mjs` prints each code's record
and how often its best-practice forecast wins. Each manager plays the
same engine week by week and reacts only to what their screen shows: the reported
backlog, crews and week.

With simple 1.2's rules (a $5.00M budget, 1.1 onboarding and contract differences),
on the **ledger** code the record has:
- 2 of 40 never delivered (2 bankrupt, none terminated), listed and counted as such;
- among the 38 delivered, a median of week 14 and a 10th–90th percentile range of
  weeks 13–18;
- 3 of 40 on time.
Contracts run like +3 crews / 10% inspection (7 of them): median week 13, range 11–14,
29% on time. On compass: median 15, 13–18, 1 of 40 on time, 3 bankrupt. With no code,
the original record: median 14, 12–17, 7 of 40 on time.

Every median, range and percentile on the desk is computed from delivered contracts
only. On-time shares are out of all contracts, with a failure counting as not on time.
The screen says so, and every range from the record shows its failures beside it
(an ✕ per failure on the dot strip). "Use this" carries the failures into the week-12
chance and into a note on the front tab.

On ledger the last contract (#40) read 100% in week 13 and was accepted in week 18,
with 28 units rejected. Its first six weeks averaged 18.6 a week (10.8 weeks to 200).
On compass: 18.5 a week, 12 → 16 with 21 rejected. With no code: 19.1 a week, 13 → 17
with 20 rejected. Live 1.1.0 had 19.1 a week; 13 → 17 with 19 rejected; median 14;
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
GitHub Pages. `.github/workflows/pages.yml` deploys `master` on every
push. `verify` (lint, tests, render checks, build) gates the deploy; the `plan`
sweep runs and reports its targets in the build log but does not block it (two targets,
7 and 17, are known misses).

## Layout

```
frontend/
  src/main.jsx          mounts the game
  src/plan/engine.js    the simulation and the past record; every tunable number is in CONFIG
  src/plan/desk.js      the Decision Desk's tools, computed from the briefing alone
  src/plan/table.js     filtering and sorting for the Records table
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
