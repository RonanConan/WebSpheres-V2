# Lesson plan: lessons 3 to 12

Plan agreed on 12 November 2026. All 12 lessons are now built. Where a built lesson differs from this plan, the lesson file in `js/lessons/` is the reference. The main differences are listed at the end.

## Decisions so far (12 November 2026)

- Loops come before Randomness, as lessons 6 and 7.
- The lessons can teach the real critical-hit rules, including condition 2's chances. The intern already knows how the manipulation works. The lessons still never use results from participants.
- Lessons 11 and 12 use a small practice project instead of WebSpheres itself, because she won't have the WebSpheres repo, and WebSpheres does little on a laptop without a headset.
- Lessons 11 and 12 are self-contained: a simulated editor, a real console and a home-made git, all inside the Academy page.
- Python and the analysis side are parked. They will get their own separate set of lessons later.
- The capstone, building a small version of the task, is a lesson of its own (lesson 10).
- Version control with git is a lesson of its own (lesson 12).
- Every lesson, including the tools lessons, gives thorough step-by-step instructions in the house style: plain, complete, factual sentences.

Lessons 3 to 9 follow the same pattern as lessons 1 and 2: about nine steps, mixing the step types, with one "Find it in WebSpheres" step near the end and a short piece of real WebSpheres code on the lesson-complete page. Line numbers refer to the WebSpheres code at version 2.8.1.

## Proposed order

| # | Lesson | Main idea | Main WebSpheres code |
|---|---|---|---|
| 3 | Text | Text values, joining text, printing to the console | `floating-number.js`, `recordTrial` in `data-manager.js` |
| 4 | If and else | Making decisions with conditions | `updateProbabilities` and the streak logic in `score-manager.js` |
| 5 | Functions | Writing your own instructions and reusing them | `isInsideSphere` and `calibrateReach` in `sphere-manager.js` |
| 6 | Loops | Repeating an instruction | `createSpheres` in `sphere-manager.js` |
| 7 | Randomness | Random numbers and probability | `calculateHitPoints` in `score-manager.js` |
| 8 | Lists and records | Arrays and objects | `selectRandomSphere`, `recordTrial` |
| 9 | Events | Code that waits for something to happen | The keyboard controls and the appear and disappear timers in `sphere-manager.js` |
| 10 | Build the game | Joining lessons 3 to 9 into one working program | The trial cycle across `sphere-manager.js`, `score-manager.js` and `data-manager.js` |
| 11 | The real code | Working with a project of several files, its console and its errors, in an editor inside the page | Spheres Practice, a small desktop version of the task |
| 12 | Version control | Saving and comparing versions with git, simulated inside the page | Spheres Practice |

**Change from the original roadmap:** Loops and Randomness swap places. Rolling 1000 hits and charting them needs a loop, so lesson 6 teaches loops first.

---

## Lesson 3: Text

**She learns:** text values (strings), the three kinds of quotes, joining text with `+`, template literals with `${}`, the difference between `"5"` and `5`, and `console.log` for printing.

**Preview:** a floating points label above a target, like the one in the headset. Its text comes from her code. A new console panel under the editor shows anything she prints.

| # | Type | Step |
|---|---|---|
| 1 | Write code | Change the floating label from `"+3"` to `"+10"`. |
| 2 | Write code, predict | Build the label by joining text and a number: `"+" + points`. Predict what appears. |
| 3 | What's in the box? | `"5" + 5` gives `"55"`, but `5 + 5` gives `10`. |
| 4 | Write code | Rewrite the label as a template literal: `` `+${points}` ``. This is exactly how `floating-number.js` builds it (line 21). |
| 5 | Quiz | Which kind of quote lets `${}` work? |
| 6 | Write code | Print a trial summary with `console.log`, in the same format as `recordTrial` (`data-manager.js`, line 397): `Trial 3: Target 5, Hand LEFT`. |
| 7 | Fix the bugs | `${points}` inside ordinary quotes shows the text `${points}`. A backtick that opens but doesn't close. |
| 8 | Write code | Build the target ID `sphere-4` and the name `Target 5` from one position variable, using a calculation inside `${}`. |
| 9 | Find it in WebSpheres | In `floating-number.js`, which line builds the text that floats up? |

**Lesson-complete code:** the `console.log` line from `recordTrial`.

---

## Lesson 4: If and else

**She learns:** `true` and `false`, comparisons (`===`, `!==`, `<`, `>`, `<=`, `>=`), `if`, `else`, `else if`, combining conditions with `&&` and `||`, and the `? :` shortcut from lesson 1's real code.

**Preview:** a hit happens on a target. Her code decides the hit type's colour and size. A second view shows the two hands with their critical-hit chances as bars.

| # | Type | Step |
|---|---|---|
| 1 | What's in the box? | `let points = 7; let big = points > 5;` What is in `big`? |
| 2 | Write code, predict | Use `if` and `else` to make critical hits gold and large, and normal hits grey and small. This is the rule in `floating-number.js`, lines 14 and 15. |
| 3 | Quiz | `=` puts a value in a box and `===` compares two values. Which line checks whether `hitType` is `"critical"`? |
| 4 | Write code | An `else if` chain that sets the number of trials for each mode, as `setMode` does (`sphere-manager.js`, lines 772 to 790): 352 by default, 110 for `short`, 44 for `fmode` and 110 for `block`. |
| 5 | Fix the bugs | `if (hitType = "critical")` is always true. A missing closing brace. |
| 6 | Write code | Set each hand's critical-hit chance from the condition and the dominant hand (`updateProbabilities`, `score-manager.js`, lines 39 to 52). The preview's bars move. |
| 7 | Put the lines in order | The streak rule: three critical hits in a row with the non-dominant hand starts fire mode (`score-manager.js`, lines 94 to 121). |
| 8 | Quiz | `&&` and `||`: which conditions are true for a given hit? |
| 9 | Find it in WebSpheres | In `updateProbabilities`, which line runs for condition 2 when the dominant hand is the left hand? |

**Lesson-complete code:** line 14 of `floating-number.js` again, now that she can read all of it.

---

## Lesson 5: Functions

**She learns:** what a function is, how to call one, parameters, `return`, built-in functions (`Math.max`, `Math.floor`, `Math.sqrt`), and why functions make code reusable.

**Preview:** the preview calls her functions. For example, it places each target using her `angleOf` function. In another step, it moves a hand towards a target and lights the target when her `isInside` function returns `true`.

**New step type, "Pass the tests":** she writes a function, and a table of example inputs shows a tick or a cross for each expected output. Lessons 6 to 9 reuse this type.

| # | Type | Step |
|---|---|---|
| 1 | What's in the box? | `Math.max(0.3, 0.8 * 0.3)` gives 0.3: the ring never comes closer than 0.3 m. |
| 2 | Write code | Use `Math.max` so that a very short reach still gives a ring of 0.3 m (`calibrateReach`, line 647). |
| 3 | Pass the tests | Write `angleOf(i)`, returning `-40 + i * 8`. Inputs 0, 5 and 10 should give -40, 0 and 40. The preview uses it to place the targets. |
| 4 | Write code, predict | Change the spacing inside `angleOf`. Predict what happens to the arc. |
| 5 | What's in the box? | Follow a value through a function call and its parameter. |
| 6 | Pass the tests | Write `milestone(score)`, which returns `Math.floor(score / 100)`. This is the 100-point milestone rule (`score-manager.js`, line 82). Inputs 0, 99, 100 and 250. |
| 7 | Fix the bugs | A function that forgets to `return`, so it gives `undefined`. |
| 8 | Pass the tests | Write `isInside(distance)`, which returns `true` when the distance is less than 0.08 m. The preview lights the target. |
| 9 | Find it in WebSpheres | In `isInsideSphere` (`sphere-manager.js`, lines 934 to 942), which line decides whether the hand is inside the target? |

**Lesson-complete code:** the whole `isInsideSphere` function, which uses `Math.sqrt` and `Math.pow`, the same calculation as lesson 2's last step.

---

## Lesson 6: Loops

**She learns:** the `for` loop, the counter variable, `i++`, running the same instruction many times, off-by-one mistakes, and adding up a total in a loop.

**Preview:** her loop builds the targets. The preview gives her an `addTarget(angle)` function. Each call adds one crystal.

| # | Type | Step |
|---|---|---|
| 1 | What's in the box? | How many times does `for (let i = 0; i < 11; i++)` run? |
| 2 | Write code | Call `addTarget(-40 + i * 8)` inside a loop to build the 11 targets. This is `createSpheres` (`sphere-manager.js`, lines 86 to 90). |
| 3 | Write code, predict | Build 7 targets instead. Predict where they appear. |
| 4 | Write code | Keep the arc centred for any number of targets, using lesson 2's maths: `firstAngle = -(count - 1) * spacing / 2`. |
| 5 | Quiz | What changes with `i <= 11` instead of `i < 11`? |
| 6 | Fix the bugs | A loop with `i--` that never ends. The page stops it and explains why. |
| 7 | Write code | Add up the total of a block: 11 targets, each shown 10 times, at 3 points each. |
| 8 | Make it match | Change the count and spacing until your arc matches the outlines. |
| 9 | Find it in WebSpheres | In `createSpheres`, which line sets the angle for each target? |

**Lesson-complete code:** the first five lines of `createSpheres`.

---

## Lesson 7: Randomness

**She learns:** `Math.random`, turning it into whole numbers with `Math.floor`, probability, why random results vary from run to run, and simulating many trials with a loop.

**Preview:** a chart instead of the 3D scene. The page runs her code for 1000 hits and shows the results as bars. She can press a button to run it again and see the bars change slightly.

| # | Type | Step |
|---|---|---|
| 1 | Quiz | Which values can `Math.floor(Math.random() * 5) + 1` give? |
| 2 | Pass the tests | Roll the points for a normal hit, from 1 to 5. The chart shows 1000 rolls. The test checks the range, and that every value appears. |
| 3 | Write code, predict | Give a hand a 0.3 critical-hit chance and run 1000 hits. Predict about how many are critical. |
| 4 | Quiz | Why isn't the result exactly 300? |
| 5 | Pass the tests | Roll the points for a critical hit, from 5 to 10. |
| 6 | What's in the box? | WebSpheres checks `random < (1 - criticalChance)`. If `random` is 0.75 and the chance is 0.3, is the hit normal or critical? |
| 7 | Fix the bugs | `Math.random() * 5` without `Math.floor` gives decimals. `Math.floor(Math.random() * 5)` gives 0 to 4. |
| 8 | Write code | Use the condition 2 chances for each hand (0.05 and 0.55), and compare the two hands in the chart. |
| 9 | Find it in WebSpheres | In `calculateHitPoints` (`score-manager.js`, lines 54 to 73), which line decides whether a hit is critical? |

**Lesson-complete code:** the whole `calculateHitPoints` function.

---

## Lesson 8: Lists and records

**She learns:** arrays, counting positions from 0, `length`, `push`, looping over an array, objects with named fields, and a list of objects. Together, these are a data table.

**Preview:** a bar above each target shows how many times it has appeared. A small table under the scene shows the trials she records.

| # | Type | Step |
|---|---|---|
| 1 | What's in the box? | `appearanceCounts[0]` is the first target, so target 11 is position 10. |
| 2 | Write code | Add one to the count for target 5. The bar above it grows. |
| 3 | Quiz | What does `length` give for an array of 11 counts? |
| 4 | Write code | Use a loop to collect every target shown fewer than 2 times (`selectRandomSphere`, `sphere-manager.js`, lines 852 to 889, simplified). |
| 5 | Write code | Make a trial record as an object: trial number, target, hand, points and hit type (`recordTrial`, `data-manager.js`, lines 381 to 395). |
| 6 | Fix the bugs | Target numbers in the data file run from 1 to 11, but positions in the array run from 0 to 10. |
| 7 | Put the lines in order | Record a trial, then turn it into a CSV row. |
| 8 | Make it match | Build a CSV row that matches a row from a real-format trial file exactly. |
| 9 | Find it in WebSpheres | In `recordTrial`, which line converts the position (0 to 10) to the target number (1 to 11)? |

**Lesson-complete code:** `TRIAL_HEADER` and `formatTrialRow` from `data-manager.js`.

**Data rule:** the lesson shows a row in the real format with made-up values. It never uses data from real participants.

---

## Lesson 9: Events

**She learns:** what an event is, `addEventListener`, passing a function to be called later, `setTimeout`, and keeping track of state.

**Preview:** an interactive version of the task. A target appears, she clicks it with the mouse, it scores points with the rules from lessons 4 and 7, and the next target appears after a delay.

| # | Type | Step |
|---|---|---|
| 1 | Quiz | Which of these are events: a click, a key press, a variable changing, a timer finishing? |
| 2 | Write code | When a target is clicked, add points to the score. |
| 3 | What's in the box? | In what order do three `console.log` lines print, when one is inside `setTimeout`? |
| 4 | Write code | Use `setTimeout` to show the next target 500 milliseconds after the timer starts, as `startAppearTimer` does (`sphere-manager.js`, lines 892 to 920). |
| 5 | Write code | Pressing P pauses and resumes. This uses a true or false value, as in the real P key. |
| 6 | Fix the bugs | `addEventListener('click', onHit())` calls the function straight away, instead of passing it. |
| 7 | Put the lines in order | The steps of one trial, from the target appearing to recording the trial. |
| 8 | Write code | After a hit, show the next target when the 300 millisecond cooldown from `startDisappearTimer` ends (`sphere-manager.js`, lines 922 to 931). The target itself disappears as soon as it's hit. |
| 9 | Find it in WebSpheres | In `setupCalibration` (`sphere-manager.js`, lines 281 to 300), which line listens for key presses? |

**Lesson-complete code:** the `keyActions` object and its `keydown` listener, which map keys such as Space, H and P to commands.

---

## Lesson 10: Build the game

**She learns:** how separate pieces of code work together as one program. There are no new language features in this lesson. She writes each piece again from memory, with hints that point back to the lesson where she first learned it.

**Preview:** the game grows one piece at a time. By the end, targets appear on the arc, she clicks them with the mouse, hits score points with the WebSpheres rules, critical hits show a gold label, and each trial is recorded.

| # | Type | Step | Uses |
|---|---|---|---|
| 1 | Write code | Build the 11 targets with a loop. | Lesson 6 |
| 2 | Write code | Choose a random target from those shown fewer than 2 times, and not the same target twice in a row. | Lessons 7 and 8 |
| 3 | Write code | Show the chosen target 500 milliseconds after the timer starts. | Lesson 9 |
| 4 | Write code | When the target is clicked, decide the hit type and roll the points. | Lessons 4 and 7 |
| 5 | Write code | Show the floating label: gold and large for a critical hit, grey and small for a normal hit. | Lessons 3 and 4 |
| 6 | Write code | Record the trial as an object, and log a line in the `recordTrial` format. | Lessons 3 and 8 |
| 7 | Fix the bugs | The game has two planted bugs: target numbers that are off by one, and a timer that calls its function straight away. | Lessons 8 and 9 |
| 8 | Write code | End the block after 22 trials, and show the total score. | Lessons 4 and 6 |
| 9 | Put the lines in order | Put the real WebSpheres functions in the order a trial uses them: `selectRandomSphere`, `startAppearTimer`, `isInsideSphere`, `calculateHitPoints`, `recordTrial`, `startDisappearTimer`. | All |

**Lesson-complete page:** a table that matches each part of her game to the WebSpheres function that does the same job.

**Spheres Practice:** a tidied version of the finished game becomes the practice project for lessons 11 and 12.

---

## The practice project: Spheres Practice

She won't have the WebSpheres repo, and WebSpheres does little on a laptop without a headset. So lessons 11 and 12 use a small practice project, built for the purpose:

- **What it is:** the lesson 10 game as a set of files. Targets appear on an arc in a 3D scene, she clicks them with the mouse, and hits score points with the WebSpheres rules. Critical hits are gold, and each trial is logged to the console and can be shown as a CSV file in the WebSpheres trial format, with the values from her own clicks.
- **How it's laid out:** like WebSpheres, but much smaller. It has an `index.html` and four A-Frame components with the same names and jobs: `sphere-manager.js` (targets), `score-manager.js` (points and critical hits), `floating-number.js` (the points label) and `data-manager.js` (trial records and the CSV file). Each file is short enough to read in one sitting.
- **Where it lives:** inside the Academy. Every learner starts from the same prepared files, not from her own lesson 10 code, so that the checks know what to expect. Her copy is saved in the browser, and a Reset button restores the original files.

## The workspace

Lessons 11 and 12 are self-contained. They run inside the Academy page like the other lessons, with no install, no download and no administrator rights. For these two lessons, the middle and right panels change to a **workspace**:

- **Middle:** a small code editor with the Spheres Practice files. It has a file list, a tab for each open file, a search across all files, and a bottom panel with two tabs: **Console** and **Terminal**.
- **Right:** the game, running from the files. When she presses Run, her edited files really run in the preview. Their `console.log` lines and real browser error messages appear in the Console tab, and she can type an expression into the console to inspect the running game.
- **Git:** a small, home-made version of git that runs in the page. It saves snapshots of the files as commits, keeps branches as named pointers, and compares versions line by line. She can use it through a **Source Control panel** with buttons, or by typing the real commands in the Terminal tab. The output looks like real git's, but every message is written in the house style.

Because the page can see her files, her console and her git history, every step in lessons 11 and 12 is checked automatically, with the same hints, stars and nudges as the other lessons.

**What carries over to the real tools:** the editor and git are stand-ins, so the screens will look different in the real VS Code and real git. The actions, the file layout and the command names are the same, so moving to the real tools is mostly a matter of finding where the buttons are.

**Git commands the Terminal accepts:** `git init`, `git config user.name`, `git status`, `git add`, `git commit -m`, `git branch`, `git switch` (and `git checkout` for switching branches), `git log --oneline`, `git diff`, `git restore` and `git merge`. Any other command gets a plain message saying that this lesson's terminal doesn't support it.

---

## Lesson 11: The real code

**She learns:** how to find her way around a project with several files, run it, read its console, and change it safely.

Each step gives numbered instructions, with every button and keyboard shortcut named.

| # | Type | Step |
|---|---|---|
| 1 | Quiz | Which file does what? She opens each file from the file list and matches it to its job. |
| 2 | Find it | Search all files for `calculateHitPoints`, open the file where it's defined, and click that line. The page checks the file and line she chose. |
| 3 | Run | Press Run and play at least three trials with the mouse. The page checks the console for three trial lines. |
| 4 | Console | Type an expression into the console that reads the current score. The page checks that the result matches the game. |
| 5 | Quiz | Read one component: `registerComponent`, `init` and `this`. Earlier lessons said to read `this.radius` as a variable. This step explains `this`. |
| 6 | Write code | Change one rule, such as the colour of normal hits, run the game, and see the change. The page checks the file and the running game. |
| 7 | Fix the bugs | Delete a bracket on purpose, run the game, and read the real error in the console. Then put the bracket back and run the game again. The page checks that both happened. |
| 8 | Write code | Add a `console.log` line inside `calculateHitPoints` that prints each hit's critical-hit chance, then play a few trials to see it. |
| 9 | Quiz | Show the trials as a CSV file in a new tab, and answer questions about its columns, which match the WebSpheres trial file. |

**Lesson-complete page:** a map of the real WebSpheres files, showing which of them match the four files she now knows.

---

## Lesson 12: Version control

**She learns:** what version control is for, and how to use git to save versions, try changes safely on a branch, compare versions and undo mistakes.

**How it's taught:** each git action can be done with a button in the Source Control panel or by typing the command in the Terminal tab. Each step names both, so that she recognises the commands when she meets them in guides and in real projects. Steps 2 and 9 ask her to type the command.

| # | Type | Step |
|---|---|---|
| 1 | Quiz | What a repository, a commit and a branch are, using pictures of a project's history. |
| 2 | Terminal | Type `git config user.name` with her name, so that her commits show who made them. The name is only saved in her browser. |
| 3 | Git | Turn the Spheres Practice folder into a repository, and make a first commit with a clear message. The page checks that the commit contains every file. |
| 4 | Git | Make a branch for an experiment, and switch to it. |
| 5 | Git | Change one rule on the branch, and look at the change in the side-by-side comparison. The page checks that only the intended line changed. |
| 6 | Git | Commit the change on the branch, with a clear message. |
| 7 | Git, predict | Predict, then check: what happens to the game when she switches back to `main`? She switches, runs the game, and sees the change disappear. |
| 8 | Git | Make a mess on purpose in two files, then discard the changes. The page checks that the files match the last commit again. |
| 9 | Terminal | Type `git merge` to bring the branch into `main`, then `git log --oneline` to see the history. |

**Lesson-complete page:** the habits that apply to WebSpheres too. Work on a branch, write a clear message for each commit, never edit data files or change their columns, and don't push without asking. Sharing work on GitHub (pushing and pulling) is left for later.

---

## Engine work needed

| Feature | First needed | Notes |
|---|---|---|
| Console panel that shows `console.log` output | Lesson 3 | Also useful for debugging in every later lesson. |
| Text label in the preview | Lesson 3 | The floating points label. |
| "Pass the tests" step type | Lesson 5 | A table of inputs, expected outputs and ticks. |
| The preview calls the learner's functions | Lesson 5 | For example, `angleOf` and `isInside`. |
| Protection against loops that never end | Lesson 6 | Run her code in a background worker with a time limit, so the page can stop it and explain what happened. This also replaces today's partial protection. |
| Chart preview | Lesson 7 | Bars for 1000 simulated hits, with a run-again button. |
| Table preview | Lesson 8 | The list of recorded trials. |
| Clickable preview | Lesson 9 | Clicking a target triggers her code. Lesson 10 builds the whole game on it. |
| Spheres Practice files | Lesson 11 | A tidied version of the lesson 10 game, stored inside the Academy. |
| Workspace | Lesson 11 | File list, tabs, search across files, and a multi-file editor that reuses the current editor. |
| Running a whole project in the preview | Lesson 11 | Runs the workspace files in the preview, and captures `console.log` lines and real errors. |
| Console input | Lesson 11 | Evaluates an expression inside the running game and shows the result. |
| Home-made git | Lesson 12 | Commits, branches, switching, merging, status and restore, with a Terminal tab, a Source Control panel and a side-by-side comparison view. |

## Suggested build order

Build one lesson at a time, with its engine features, and stop for review after each, as with lessons 1 and 2. Lessons 3 and 4 need the least new engine work. Lesson 6 needs the loop protection. The workspace and the home-made git, for lessons 11 and 12, are the largest pieces of engine work in the plan. Nothing before lesson 11 depends on them.

## Later

- **The real tools.** An optional appendix could walk her through the real VS Code and real git once she has access to them.
- **GitHub.** Pushing and pulling are left out of lesson 12.
- **Python.** The analysis side gets its own separate set of lessons.

## Differences in the built lessons

- **Lesson 3, step 8** builds a target ID and a target name from one position, instead of matching outlines.
- **Lesson 5** adds a "Pass the tests" table to its function steps, as planned, and its lesson-complete page shows the milestone code from `addPoints` instead of `isInsideSphere`, which step 9 already shows.
- **Lesson 7** shows its results in a panel instead of the 3D preview.
- **Lesson 7, step 8** writes a `simulate` function with a loop, instead of only changing the chances, so that it also practises lesson 6.
- **Lesson 9, step 7** is a "What's in the box?" step about timers, instead of putting the steps of a trial in order. That ordering step moved to lesson 10, step 9.
- **Lesson 10** follows the plan, with `chooseTarget` also allowing the last target again when no other is left, as `selectRandomSphere` does.
- **Lessons 11 and 12** run in the workspace described above. Their steps were adjusted to what the page can check: for example, lesson 11 adds a step that prints a value with `console.log`.
