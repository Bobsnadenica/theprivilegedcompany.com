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
