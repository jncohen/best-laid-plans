# Best Laid Plans

**Play it: <https://jncohen.github.io/best-laid-plans/>**

A classroom game about forecasting. You manage a production contract: 200 units, a
12-week deadline, a $5M budget. Before you start, you predict the week the customer
will accept the work. Then you run the project week by week and find out how right
you were.

Written for DATA 790, Module 05: Imagining, Modeling, and Prediction. It runs in any
browser, on a phone or a laptop, with nothing to install and no sign-in.

## For students

1. **Open the link** and enter the scenario code your instructor gives you (or use the
   link with the code already in it, such as
   `https://jncohen.github.io/best-laid-plans/?seed=ledger`).
2. **Read The Contract tab.** It states every rule and how your forecast is judged.
3. **Make your plan:** how many crews to add at the start, how much of the line to put
   on inspection, and whether to run a second shift. You can change course later.
4. **Look at whatever you think you need.** Every tab is open:

   | Tab | What it is |
   |---|---|
   | The Contract | the terms, the rules and the scoring |
   | Status Report | progress and money, as a project dashboard reports them |
   | Project Controls | a burn-down chart and a defect control chart |
   | What-if Planner | what other plans would cost and when they'd finish on paper |
   | Team Chat | five colleagues, each with a different way of answering "when will we be done?" |
   | Ask an AI | a prompt you can paste into any AI assistant |
   | Last 5 Contracts | the five newest contracts on this line, and the story of the last one |
   | Records | all 40 past contracts on this line; you can download them as a CSV |

   The tabs disagree. Deciding which to trust is the exercise. The game counts what you
   look at, but never uses it against you.
5. **Commit three numbers:** the week you think the customer accepts the work, an 80%
   range (earliest to latest), and your chance of finishing by week 12. These are
   what you're judged on. You can move your forecast during play, but only the first
   one counts.
6. **Play week by week.** Each week, add or release crews, set inspection and the
   shift, then play the week. When something big happens (the customer adds work, the
   dashboard passes 90%, units are rejected, money runs short), you'll be asked whether
   to keep or change your forecast.
7. **When it says "finished," wait.** Don't reveal until your instructor says so.
8. **After the reveal,** read "Your game in 9 facts" and click **Download my results
   (.txt)**. Keep that file: it has your plan, your forecast and how it did, and every week, for the
   class discussion. If you play again, the next file is saved as a new run, so your
   first play is never lost.

### How your forecast is judged

There is no forecast score. At the end you see three plain verdicts on the forecast
you committed before week 1:

- **Your week:** how many weeks off it was, and whether early or late.
- **Your 80% range:** whether it held, and how wide it was beside the record's range.
  A wide range holds easily; a narrow range that holds is the skill.
- **Your chance of week 12:** what you said, against what happened.

One game can't tell a good forecaster from a lucky one. The score that means something
is the room's: of everyone's 80% ranges, about 8 in 10 should hold.

**Delivery** shows how the company did: 100, minus 12 a week late and 1 per $50k over
budget, and zero if the company goes bankrupt or the customer cancels.

## For instructors

- **Give the room one scenario code.** Everyone on a code faces the same contract, the
  same surprise and the same record of past contracts, so the room can compare. Each
  play still gets its own week-to-week luck. Different codes give different contracts
  and records under the same rules.
- **The handout** is the two-page Player's Guide (front: how to play; back: after the
  reveal): [web page](https://jncohen.github.io/best-laid-plans/players-guide.html) ·
  [PDF to print](https://jncohen.github.io/best-laid-plans/players-guide.pdf).
- **The reveal** holds results until you say so. "Your game in 9 facts" is numbered for
  a show of hands ("hands up if fact 3 happened to you"). It covers each student's plan,
  what they checked (how often, whether they stopped looking, and whether they used
  AI), the 90% moment, the surprise, whose advice they took, whether their range held,
  money, and luck: their own decisions replayed under 100 other
  draws.
- **Collect the results files** (`best-laid-plans-<code>-run1.txt`) if you want each
  student's first play in writing.
- Nothing is sent anywhere. The game runs entirely in the browser; the only thing it
  stores is a run counter on that device. Anything a student pastes into an AI
  assistant is their choice and goes to that service.

## How it was made

The game was designed by Joseph N. Cohen and built with the help of Claude (an AI
model from Anthropic), which wrote much of the code and tests under his direction.

How the game works, its rules, its balance targets and how to develop it are in
[docs/DESIGN.md](docs/DESIGN.md).

## Licence

© 2026 Joseph N. Cohen. Licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See `LICENSE`.
