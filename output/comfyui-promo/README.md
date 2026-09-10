# The Privileged Company — local ComfyUI promo

**Superseded:** The user rejected the blurry result. The final four-second MP4, raw WEBM, review stills, and corresponding ComfyUI output video were deleted on 2026-09-10. Retained files document the attempt. The replacement is in `../animated-promo/`.

Four-second vertical promotion using a generated adult presenter reference and local ComfyUI animation. The English voice is narration, not lip-synchronized dialogue.

## Local setup

Apple M2, 16 GB unified memory. ComfyUI runs at http://127.0.0.1:8188.

- Video: `ltxv-2b-0.9.8-distilled.safetensors`, loaded on MPS in bfloat16.
- Text encoder: `t5xxl_fp8_e4m3fn.safetensors`, explicitly loaded on CPU with float16 computation. Do not switch this FP8-stored encoder to the MPS device.
- Models live under `/Users/privileged/ComfyUI-Shared/models`.
- The five MiniMax H3 model, encoder, LoRA, and VAE files were deleted at the user's request, freeing 44.43 GB. They were too large or used unsuitable quantization for this setup.
- The two smaller required model files were already fully downloaded when work resumed; they were not downloaded a second time.

## Assets and reproduction

- `reference.png`: original reference portrait generated with the built-in image tool; no Higgsfield used in this workflow.
- `workflow-api.json`: exact ComfyUI API graph, 384 × 672, 97 frames, 24 fps, 8 steps, CFG 1, seed 426103.
- `video-prompt.txt`: exact local animation prompt.
- `job.json` and `history.json`: generation record.
- `voice.aiff`: macOS Samantha voice, 172 words/minute.
- Spoken line: “The Privileged Company. Let's build your next idea.”
- `make_titles.py`: creates transparent title artwork using the installed Pillow runtime.

Model sources: https://huggingface.co/Lightricks/LTX-Video and https://huggingface.co/comfyanonymous/flux_text_encoders.

No social publication or website deployment is part of this task.

## Completed output

`the-privileged-company-4s.mp4`: verified 4.000 seconds, 720 × 1280, 24 fps, H.264 with AAC English narration. Native generated frames are 384 × 672; final export is resized, not native HD generation. Four raw and four composited sample frames were visually inspected. ComfyUI completed successfully in about 9.7 minutes. Models were unloaded from active memory afterward; their files remain installed.
