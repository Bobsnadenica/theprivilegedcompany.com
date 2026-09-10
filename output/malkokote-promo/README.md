# Малко коте — Голямо присъствие

## Revised neural voice version

`malkokote-neural-voice-bg-18s.mp4` replaces the macOS Daria voice with Microsoft Kalina (`bg-BG-KalinaNeural`), generated through Microsoft's online speech service using edge-tts 7.2.8. Voice generation is online; video editing and mixing are local. The original 16-second version remains available for comparison.

The script is unchanged. Speech uses rate `-8%` and pitch `-2Hz`. Phrase starts are 0.3, 5.2, and 11.2 seconds. The final card holds for two extra seconds to allow the complete natural-paced reading to finish. The saved source phrases are `kalina-0.mp3` through `kalina-2.mp3`; use `python3 output/malkokote-promo/replace_voice.py` to rebuild from them. `neural-voice-settings.json` records settings. Normalized audio timestamps and a finite sample limit keep the mix at exactly 18 seconds.

Voice support: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support

Client documentation: https://github.com/rany2/edge-tts

## Original local voice version

Deliverable: `malkokote-animated-bg-16s.mp4` — 16-second Bulgarian promotional animation for the user's safe-for-work modeling website featuring adult models 18+.

Format: 1080 × 1920, 30 fps, H.264 with AAC audio. New illustrated adult model in a black cocktail dress, subtle cat-inspired accessories, blush/champagne palette, moving illustration layers, animated Bulgarian typography, and a branded end card. Character movement is motion graphics, not lip synchronization or generated body animation.

The new decorative cat mark and palette are creative concepts for this video, not claims about existing brand assets. The ending displays the user-supplied website address `malkokote.com`, saved in `website.txt`.

## Narration

Soft Bulgarian female narration, macOS Daria, rate 140, gentle high-frequency reduction and -18 LUFS speech normalization. The quiet original musical bed is synthesized locally.

1. Малко коте. Голямо присъствие.
2. Открий стил, увереност и красота със собствен характер.
3. Модели над осемнайсет. Разгледай света на Малко коте.

## Production

The illustration was generated with the built-in image generation tool and saved as `model.png`. All animation and audio composition were rendered locally using Pillow, NumPy, macOS speech, and FFmpeg. No Higgsfield generation was used. Nothing was published or added to a website.

Reproduce from the repository root with `/Users/privileged/Projects/ComfyUI/ComfyUI/standalone-env/bin/python output/malkokote-promo/render.py`. Add `--preview` to regenerate the storyboard. All required media is retained in this folder.

## Illustration prompt

Use case: ads-marketing. Create one sophisticated 2D editorial animation character asset for Malkokote, a safe-for-work adult fashion modeling brand whose Bulgarian name means small kitty. A clearly adult 30-year-old glamorous brunette fashion model with mature facial proportions, long wavy dark hair, confident brown eyes and playful elegant smile. She wears a fully opaque fitted black cocktail midi dress with a tasteful asymmetric neckline, elegant black high heels, gold earrings and a small subtle metallic cat-ear headband as a fashion accessory. Full body, entire head, hands and feet inside the frame. Chic standing fashion-editorial contrapposto pose, one hand on hip and the other lightly brushing her hair at shoulder level. Fashion photography inspired but rendered as premium clean 2D cel-shaded editorial illustration, crisp edges, sophisticated muted rose and champagne highlights, large readable shapes, precise beautiful mature face. Sensual confidence expressed through fashion and expression, suitable for mainstream advertising. Single isolated character on genuinely transparent alpha background. No text, no logos, no background scene, no props, no ground shadow. No childlike or teen features.
