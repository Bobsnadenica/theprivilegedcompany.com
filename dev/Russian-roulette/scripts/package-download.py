#!/usr/bin/env python3
"""Build and package only the public runtime; never include local configuration."""
import os
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
env = dict(os.environ)
for name in list(env):
    if name.startswith('VITE_'):
        del env[name]
env.update(VITE_STATIC_SOLO_ONLY='false', VITE_BASE_PATH='/')
subprocess.run(['npm', 'run', 'build'], cwd=root, env=env, check=True)
output = root / 'download' / 'liars-deck.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in ['package.json', 'package-lock.json', 'start.mjs', 'start.sh', 'start.command', 'start.bat', 'START-HERE.md']:
        archive.write(root / 'release' / name, 'liars-deck/' + name)
    for folder in ['packages/server/dist', 'packages/client/dist']:
        for file in sorted((root / folder).rglob('*')):
            if file.is_file() and not any(part.startswith('.') for part in file.relative_to(root).parts) and file.name != 'sketchfab-9mm.glb':
                archive.write(file, 'liars-deck/' + file.relative_to(root).as_posix())
    assert archive.testzip() is None
print(f'{output.relative_to(root)}: {output.stat().st_size:,} bytes')
