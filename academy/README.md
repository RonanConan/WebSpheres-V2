# WebSpheres Academy

A beginner's introduction to programming, taught through small pieces of WebSpheres code. There are 12 lessons, each with about nine short steps. The learner edits real code, sees the result straight away, and presses **Check my answer**. Every step is checked automatically, so she can work through the course on her own.

## Opening it

The **Academy** button on the observer page, next to **Hide guide**, opens the course in a new tab. The Academy is part of WebSpheres, so it's published whenever WebSpheres is.

The 3D preview and the practice project load A-Frame 1.7.0 from aframe.io, so they need an internet connection. Without one, the code still runs and is still checked, but the 3D view is missing.

Progress, stars and the practice project are saved in the browser, on that computer only. **Reset progress**, at the top right, deletes all of it after asking for confirmation.

Add `?quick` to the address (`index.html?quick`) to unlock every lesson, shorten the hint timers to 3 seconds, and add a **Skip with full marks** button to every step. Skipping a code step puts the model answer in the editor, so the next step starts from working code. That's for teachers testing lessons.

## Lessons

| # | Lesson | What she learns |
|---|---|---|
| 1 | Variables | Labelled boxes, text and numbers, changing values, `const`, comments |
| 2 | Numbers and maths | Operators, calculating from other variables, order of operations, rounding errors |
| 3 | Text | Strings, joining text, template literals, `console.log` |
| 4 | If and else | Booleans, comparisons, `if`, `else if`, `&&` and `\|\|` |
| 5 | Functions | Calling, writing, parameters, `return`, `Math.max` and `Math.floor` |
| 6 | Loops | `for` loops, counters, off-by-one errors, adding up totals |
| 7 | Randomness | `Math.random`, rolling whole numbers, chance, testing random code |
| 8 | Lists and records | Arrays, indexes from 0, `push`, objects, a data file row |
| 9 | Events | Listeners, passing functions, `setTimeout`, key presses |
| 10 | Build the game | Joining lessons 3 to 9 into a playable version of the task |
| 11 | The real code | A project of several files, search, the browser console, real errors, components and `this` |
| 12 | Version control | git: commits, staging, branches, comparing, discarding and merging |

Each of lessons 1 to 9 ends with a step that finds something in the real WebSpheres code, and every lesson's complete page shows real WebSpheres code that the learner can now read. [LESSON_PLAN.md](LESSON_PLAN.md) has the original plan and the decisions behind it.

## Step types

| Type | What she does |
|---|---|
| Write code | Edits the code to reach a goal, watching the preview |
| Pass the tests | Writes a function, and a table of example inputs shows a tick or a cross for each one |
| Spot the bug | Fixes code that has been broken on purpose |
| Make it match | Changes values until her targets match white outlines in the preview. The outlines turn amber when she's close and green when they match |
| What's in the box? | Reads a few lines and types the final value of a variable, without running them |
| Quiz | Picks one answer, or every answer that works |
| Put the lines in order | Drags or arrows jumbled lines into an order that works |
| Find it in the real code | Clicks the line in real WebSpheres code that does something |
| Do it | In lessons 11 and 12, carries out a task in the practice project, such as running it or committing with git |

Any code step can also have **Predict first**: a multiple-choice question before the code unlocks. A correct prediction earns a bonus star.

## How it plays

- **Hints on a timer.** The first hint unlocks after 45 seconds, the next after a further 60, and the answer after a further 90. Opening one asks "Are you sure?" and costs a star.
- **Stars.** Each step is worth 3 stars, plus 1 for a correct prediction. In code and task steps she can try as often as she likes. In the steps that can be guessed, each wrong answer costs a star.
- **Friendly errors.** Common beginner mistakes, such as missing quotes, curly quotes, a comma for a decimal point, wrong capital letters, a missing bracket, or brackets after a function passed to a listener, are explained in plain English, and the line is highlighted.
- **Loops that never end** are stopped and explained, instead of freezing the page.
- **"Are you sure?" nudges.** Some near misses get a nudge instead of a plain "wrong", such as typing 0.56 instead of `0.8 * reach`.
- **Checks that test behaviour.** Where code could be right by luck, the page runs it with other values, simulates clicks and timers, or calls a random function thousands of times.

## Lessons 11 and 12: the workspace

Lessons 11 and 12 run in a workspace inside the page, so they need no install and no download. The learner works on **Spheres Practice**, the lesson 10 game written out as a small project laid out like WebSpheres: `index.html` and four A-Frame components with the WebSpheres names.

- The code editor has a tab for each file, and a search across all the files.
- **Run** loads the project in the right-hand panel. Its console messages and real browser errors appear in the Console tab, and expressions typed there run inside the game.
- In lesson 12, a home-made git runs in the page. The Source control tab has buttons, and the Terminal tab accepts the real commands: `init`, `config user.name` and `config user.email`, `status`, `add`, `commit -m`, `branch`, `switch` (and `checkout`), `log`, `diff`, `restore` and `merge`.

The project's files are in `practice/`. After editing them, run `node academy/tools/build-practice.cjs` from the WebSpheres folder to pack them into `js/practice-files.js`, which the page loads. A test fails if the two are out of step.

## Files

- `index.html`, `css/academy.css`: the page
- `preview.html`: the 3D scene, driven by messages from the page
- `js/runner.js`: runs the learner's code, stops loops that never end, and turns errors into plain English
- `js/marking.js`: marks trace, quiz, order and find answers, builds test tables, and counts stars
- `js/game.js`: the functions, events and timers for lessons 6, 9 and 10, with a simulated clock for checking
- `js/editor.js`: the code editor, with highlighting and line numbers
- `js/minigit.js`: the home-made git for lesson 12
- `js/workspace.js`: the workspace for lessons 11 and 12
- `js/practice-files.js`: the packed Spheres Practice files
- `js/academy.js`: steps, checks, hints, stars and saved progress
- `js/lessons/`: one file per lesson
- `practice/`: the Spheres Practice project
- `tools/build-practice.cjs`: packs `practice/` into `js/practice-files.js`
The tests are with the other WebSpheres tests, and run as part of `tests/run-all.ps1`:

- `tests/academy-lessons.cjs`: checks every lesson step, the friendly errors and the house style
- `tests/academy-workspace.cjs`: plays every task in lessons 11 and 12, and checks the git commands

The course used to live in its own repository, WebSpheres-Academy. Its history up to 13 November 2026 stays there.
