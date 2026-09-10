# The Privileged Company — English and Bulgarian, 16 seconds

Two localized revisions of the approved eight-second illustrated promo:

- `en/the-privileged-company-en-16s.mp4`: English narration and graphics.
- `bg/the-privileged-company-bg-16s.mp4`: Bulgarian narration and translated graphics; the company name and domain retain their original spelling.

Both are 1080 × 1920, 30 fps, H.264 with AAC audio. Motion is rendered again over 16 seconds, with gentler pacing and longer reading time. The illustrated presenter is an animated layer, not a lip-synced speaker. The approved eight-second original is preserved.

## Voice direction

English: macOS Karen female voice, 142 words/minute setting. Bulgarian: macOS Daria female voice, 146 words/minute setting. Each narration is produced as three separate phrases, with planned pauses at 0.65, 4.45, and 12 seconds. Speech has a gentle upper-midrange reduction, low-pass filtering, and -18 LUFS normalization to reduce the sharpness of the earlier mix. The original locally synthesized music bed is extended and kept quiet below the voice. No Higgsfield generation was used.

### English script

Every great idea starts with a little imagination.

At The Privileged Company, we build websites, apps, and smart automation.

Let’s bring your idea to life. Together.

### Bulgarian script

Всяка голяма идея започва с малко въображение.

В Привилиджд Къмпани създаваме уебсайтове, приложения и умни автоматизации.

Нека превърнем твоята идея в реалност. Заедно.

The company name is written phonetically only in the Bulgarian speech input, for pronunciation. Its original English spelling remains on screen.

## Reproduce

Use `/Users/privileged/Projects/ComfyUI/ComfyUI/standalone-env/bin/python output/animated-promo-v2/render.py en` and the same command with `bg`. The renderer imports the original illustration and motion design from `../animated-promo/render.py`, and consumes the saved voice clips. Add `--preview` to render a storyboard instead of a video. `scripts.json` retains voice settings and speech inputs.

Only promotional media was created. These videos have not been published or added to the website.
