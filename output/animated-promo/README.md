# The Privileged Company — illustrated promo

Deliverable: `the-privileged-company-animated-8s.mp4` — 8 seconds, 1080 × 1920, 30 fps, H.264 with English AAC narration.

The previous blurry four-second video and its raw render were deleted at the user's request. This replacement uses an AI-generated illustrated adult presenter with locally composed motion graphics, animated interface cards, typography, transitions, and an original synthesized music bed. The presenter illustration moves as a layer; it is not lip-synced character animation. No Higgsfield or ComfyUI video generation is used for this replacement, so there is no frame-by-frame diffusion blur.

## Storyboard

- 0–2 seconds: “Big ideas start here” and illustrated presenter entrance.
- 2–5.4 seconds: moving website, app, and automation graphics.
- 5.4–8 seconds: copper/ivory transition into “Build Anything”, call to action, and the website address.

English narration (macOS Samantha): “Big ideas start here. The Privileged Company. Websites, apps, and automation. Let’s build yours.”

The original music bed was synthesized locally in `render.py`. Interface cards are illustrative graphics, not screenshots or product claims. This asset has not been published or added to the website.

## Reproduce

Run `/Users/privileged/Projects/ComfyUI/ComfyUI/standalone-env/bin/python output/animated-promo/render.py` from the repository root. `ffmpeg` is expected at `/opt/homebrew/bin/ffmpeg`. The renderer uses the saved illustration and narration, Pillow, NumPy, and installed macOS fonts. Use `--preview` to regenerate the storyboard.

## Illustration prompt

Generated with the built-in image generation tool, then copied into this folder as `presenter.png`.

Use case: ads-marketing. Generate a polished 2D editorial cartoon character asset for an animated promotional video for a digital design company. One beautiful confident clearly adult woman around 28 years old, long flowing dark brunette hair, warm expressive brown eyes, tasteful fitted copper-orange sleeveless midi dress, small gold earrings, elegant natural makeup, warm knowing smile. Modern sophisticated editorial illustration, clean precise dark ink contours, large flat shapes, subtle cel shading, no photorealistic detail, premium contemporary animation art. Three-quarter body portrait from head to below knees, standing in relaxed contrapposto, facing the camera, right hand on hip and left hand lifted palm up in a welcoming presenter gesture. All hands and hair fully within frame. Strong readable silhouette. Single isolated character on genuinely transparent background with alpha channel. No props, no text, no logos, no background, no ground shadow. Portrait canvas. Visually appealing and glamorous but fully clothed and suitable for a business advertisement.
