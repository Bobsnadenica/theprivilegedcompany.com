"""Package original generated artwork; preserve source pixels and alpha."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
target = root / "public" / "art"
target.mkdir(parents=True, exist_ok=True)
sheet = Image.open(root / "art-source" / "ember-sheet.png").convert("RGBA")
for index, name in enumerate(["young", "adventurer", "guardian"]):
    sprite = sheet.crop((index * 512, 96, (index + 1) * 512, 832))
    sprite.save(target / f"ember-{name}.webp", quality=90, method=6)
    assert sprite.getpixel((0, 0))[3] < 5, "Expected transparent padding"
world = Image.open(root / "art-source" / "willowmere.png").convert("RGB")
world.save(target / "willowmere.webp", quality=88, method=6)
for asset in target.glob("*.webp"):
    print(asset.name, asset.stat().st_size)
