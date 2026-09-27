# The Password Game

A free, standalone browser logic puzzle. All 37 rules must pass at the same
time. English and Bulgarian share identical validation; word-based answers
remain English, with complete accepted-word lists in the hints.

Open `index.html` through the site's local HTTP server. No install, build,
account, API or paid dependency is required. The game uses native ES modules,
`Intl.Segmenter`, `BigInt` and `<dialog>` in modern browsers.

```sh
node --test dev/password_game/rules.test.mjs
node --check dev/password_game/game.mjs
```

`rules.mjs` contains validation and a constructive solvability proof. The check
constructs a winning solution for every year from 2000 through 2100 in both
languages. It also covers all 37 rules individually, discovery/regression,
Unicode emoji and character positions, equation boundaries, oversized input,
and the interacting final constraints. The proof is not shown as a game hint.

`game.mjs` owns the UI, progress, optional hints, symbol insertion, timer,
language switch and victory. Native `maxlength` limits input to 1,024 UTF-16
units; displayed length and positional rules count visible grapheme clusters.
Joined emoji, skin tones, flags and keycaps count as one emoji each. Digits in
keycap emoji still contribute to the digit sum. The year is fixed at page load.

Use only a made-up puzzle password. The game does not send or store puzzle
input. Only the best elapsed time and language preference use local storage;
storage failures do not prevent play. Copying is an explicit player action.

September 2026 QA: seven automated checks passed, including 202 constructed
wins across years/languages. Local browser checks covered English/Bulgarian
wins, earlier-rule regression, hints, insertion at the caret, language changes,
reset confirmation, clipboard output, phone viewports at 320 and 390 pixels,
desktop layout and contact navigation. Phone checks are viewport checks, not
physical-device certification. Reduced-motion and blocked-storage fallbacks
are present in source; those browser settings were not changed for QA.

Campaign images and publication records belong in the sibling `Social` project,
not in this public game directory. The in-game contact link offers app/game
development and 1:1 consultations with a certified senior cloud architect.
