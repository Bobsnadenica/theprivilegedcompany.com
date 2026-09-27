# Sugarbox: The Hollow Orchard

An ASCII-first idle RPG inspired by the structure of Candy Box and Candy Box 2, with original text, map, items, quests, puzzles, brewing, forging, saves, and endgames.

V3 keeps the minimal discovery UI from V2 and adds a living-world layer: hidden location details, a quiet journal, 16 quests across multiple encounter types, 12 riddles, 12 forge recipes, 10 cauldron recipes, 8 wishes, optional endings, and behavior-triggered secrets.

## Run

```sh
./run.sh
```

This starts a local server, opens `http://127.0.0.1:4173/`, and reports whether Colima, Docker, and GitLab Runner are running.

To stop the server started by `./run.sh`:

```sh
./exit.sh
```

## Test

```sh
npm test
```

## Browser release — 2026-09-27

Free browser play needs no account or backend. Gameplay is in English. Progress
stays in this browser; the save menu exports a code for backups or another device.
If browser storage is blocked or full, play continues with a visible export reminder.

This pass keeps the ASCII discovery style and adds a short opening hint, 44px
controls, labelled save fields, keyboard focus preservation, and a contact link
for game projects. Automatic updates no longer replace a focused text field or
clear a draft. Imported saves are checked before adoption, and journal text is
escaped. Candy production preserves partial seconds; a failed final quest round
does not award victory; large chocolate counters settle without a long loop.

Validation: 30 Node tests, including endgame progression, legacy save migration,
blocked storage, invalid imports and escaped journal markup. Local browser checks
covered 320px and 390px phone widths and desktop, light/dark themes, riddles,
combat and quest choices, farming, crafting, save import/export and reload.
Phone checks use browser viewport emulation, not physical-device testing.

The stylesheet, entry point and module imports share release query `20260927b`.
Bump it together for later releases so cached modules do not mix versions.
The bilingual Dot campaign assets, prompts and publication receipts belong in
the separate `../Social/` project, not this public repository.
