# Who Wants to Be Smart?

Kid-friendly quiz game built with Flutter for early learners (English + Bulgarian).
The app is designed to feel playful, calm, and fast, with voice narration, colorful
feedback, optional classroom flow, and local progress tracking.

## Product Purpose

The goal is simple:
- Make learning questions feel like a mini game show.
- Keep interaction short and clear for ages ~3-6.
- Support both home play and classroom play without forcing one mode.

## What the App Does Today

### Core gameplay
- 20-question sessions.
- Win target: 15 correct answers.
- 3 lives.
- Correct answers give points and move the character up the climb track.
- End screen shows score, stars, and replay options.

### Play modes
- Quick Play:
  - one-tap path for home users
  - no classroom setup required
- Classroom mode:
  - create classes
  - save players and scores per class
  - view class leaderboard

### Language + voice
- English and Bulgarian language support.
- Questions and choices are read aloud.
- Voice profile tuned for kids:
  - slower pace
  - softer pitch
  - female/calm voice preference where available
- In-app voice settings:
  - narration preset (`Gentle`, `Calm`, `Story`)
  - speed control slider
  - pause-before-answers slider
  - one-tap voice preview sample (EN/BG)
- Small pauses are added:
  - between question and choices
  - after result feedback before the next question

### Feedback and animation
- Positive/negative answer SFX.
- Lottie reactions:
  - yes animation
  - no animation
  - confetti when completing the run
- Mute button persists and controls both TTS + SFX.
- Animated kid-friendly background is integrated across main screens
  (current version is functional and colorful, but still needs a stronger
  welcome-screen hero design).

### Progress and leaderboards
- Class leaderboard.
- Global leaderboard (across all local classes on device).
- Personal profile:
  - class rank
  - global rank
  - badge list
  - learning level progress
  - personal top runs

### Store / DLC
- Built-in starter pack is always installed.
- Coming Soon placeholder packs are shown at €0.99.
- Placeholder packs currently display 365 questions each.

## User Flow

1. Language selection.
2. Class selection screen:
   - Quick Play or class card.
3. Name entry (3-letter arcade style).
4. Game starts:
   - question + choices read aloud
   - player selects answer
   - reveal feedback + short delay
   - next question
5. Game over / complete:
   - score summary
   - replay, home, or profile
6. Optional:
   - open profile
   - open leaderboards
   - open DLC store

## Technical Architecture

### Stack
- Flutter + Dart
- Riverpod (state management)
- SQLite via `sqflite`
- `flutter_tts` for narration
- `just_audio` for sound effects
- Lottie for reaction animations

### Main modules
- `lib/core/`
  - constants
  - providers (session, locale, audio prefs)
  - database helper
  - services (audio + TTS)
  - theme
- `lib/features/arcade/`
  - language / class / name entry screens
- `lib/features/game/`
  - game state machine and gameplay UI
- `lib/features/classroom/`
  - class data models and leaderboard/profile screens
- `lib/features/dlc/`
  - manifest models, store screen, pack service

### State model (high level)
- `sessionProvider`:
  - currently selected class
  - pending player name
  - active player identity
- `gameProvider`:
  - active question
  - score/lives/progress
  - phase (`playing`, `answerRevealed`, `complete`, etc.)
- classroom providers:
  - classes list
  - class leaderboard
  - global leaderboard
  - player profile progress
- DLC provider:
  - visible packs and install status

## Data Model (SQLite)

Tables:
- `classes`
- `players`
- `scores`
- `question_packs`

What is persisted:
- class and player records
- historical scores per session
- installed pack metadata

What is computed from persisted data:
- class ranking
- global ranking (device-local)
- profile statistics and badges

## Voice System Notes

Voice is one of the most important parts of this app.

Current behavior:
- Selects locale-matching voice.
- Scores voices by:
  - locale fit
  - female/calm hints
  - quality hints when exposed by platform
  - novelty/robotic avoidance
- Reads:
  - question
  - brief pause
  - each answer choice
- Uses cancellation-safe sequencing so new question speech does not deadlock
  old speech calls.

Practical caveat:
- Exact voice quality still depends on each device OS and installed voices.

## DLC Website Layout

The marketing site and DLC site are under:
- `website/`
- `website/dlc_website/`

DLC site contains:
- `index.html` (store page)
- `manifest.json`
- `packs/` with zip files
- optional source question JSON files

For production:
- Replace `YOUR_USERNAME` placeholder URLs in
  `website/dlc_website/manifest.json`.
- Set real manifest URL in app constants.

## Run Locally

```bash
flutter pub get
flutter run
```

### Analyze

```bash
flutter analyze
```

### Tests

```bash
flutter test
```

Known current test caveat:
- `test/widget_test.dart` currently times out in `pumpAndSettle`.

## Current Limitations

- Global leaderboard is still device-local (not cloud-synced yet).
- Voice quality is improved but still varies by OS voice availability and
  still needs a major quality jump.
- Welcome-screen background still needs a stronger visual pass.
- DLC store placeholders are not real purchasable packs yet.

## Minimal, Realistic Roadmap

Keep scope tight and quality high.

### Priority 1 — Major voice quality improvement (next pass)
- Tune preset mapping per platform:
  - iOS calibration
  - Android calibration
- Add optional "result feedback voice style" toggle
  (more excited vs more calm).
- Add richer fallback handling when the preferred voice is unavailable.

### Priority 2 — Welcome-screen background upgrade
- Replace the current welcome background with a higher-quality animated scene
  that feels more intentional and engaging for kids.
- Keep motion smooth and lightweight, without affecting gameplay performance.

### Priority 3 — Stability and confidence
- Fix flaky widget test and add focused tests for:
  - question transitions
  - answer reveal delays
  - leaderboard query outputs
- Add small telemetry/log hooks for voice fallback diagnostics in debug builds.

### Priority 4 — Content quality
- Expand bilingual starter content carefully.
- Upgrade 1-2 DLC packs from placeholder to real curated packs.

## Collaboration Notes

When updating this project, prefer:
- minimal feature scope per cycle
- strong polish on interaction quality (voice, pacing, visual clarity)
- no regressions in gameplay flow

This keeps the experience simple for kids and reliable for parents/teachers.
