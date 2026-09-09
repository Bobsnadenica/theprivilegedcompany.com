#!/usr/bin/env python3
"""Build-time source collection. Requires beautifulsoup4 and shapely; never runs in the portal.

Cached source pages are review material, not deployable content. The checked-in
catalogue is reviewed separately; collection never overwrites that catalogue.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache-dir', type=Path, required=True)
parser.add_argument('--geography', action='store_true')
args = parser.parse_args()
args.cache_dir.mkdir(parents=True, exist_ok=True)


def fetch(url):
    path = args.cache_dir / (hashlib.sha256(url.encode()).hexdigest() + '.source')
    if path.exists():
        return path.read_bytes()
    request = urllib.request.Request(urllib.parse.quote(url, safe=':/?=&%'), headers={'User-Agent': 'TPC catalogue review (cached, build-time only)'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
            path.write_bytes(data)
            time.sleep(.4)
            return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def coordinates(url):
    url = urllib.parse.unquote(url)
    precise = re.search(r'!3d(-?[\d.]+)!4d(-?[\d.]+)', url)
    if precise:
        return [float(precise[2]), float(precise[1])], 'embedded-pin'
    for encoded in re.findall(r'!2z([^!&]+)', url):
        try:
            text = base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)).decode()
            parts = re.findall(r'(\d+)°(\d+)[′\x27](\d+(?:\.\d+)?)[″\x22]([NE])', text)
            if len(parts) == 2:
                point = {p[3]: int(p[0]) + int(p[1]) / 60 + float(p[2]) / 3600 for p in parts}
                return [point['E'], point['N']], 'embedded-coordinate-label'
        except (ValueError, UnicodeError, KeyError):
            pass
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    for key in ('q', 'll'):
        match = re.fullmatch(r'(-?[\d.]+),\s*(-?[\d.]+)', query.get(key, [''])[0])
        if match:
            return [float(match[2]), float(match[1])], 'embedded-query'
    center = re.search(r'!2d(-?[\d.]+)!3d(-?[\d.]+)', url)
    return ([float(center[1]), float(center[2])], 'review-map-center') if center else (None, 'needs-review')


def collect_catalogue():
    catalogue = BeautifulSoup(fetch('https://www.btsbg.org/node/338'), 'html.parser')
    rows = catalogue.select('.obekt-row')

    def collect(row):
        link = row.select_one('.views-field-title a')
        source = urllib.parse.urljoin('https://www.btsbg.org', link['href'])
        page = BeautifulSoup(fetch(source), 'html.parser')
        article = page.select_one('article.node')
        areas = [n.get_text(' ', strip=True) for n in page.select('.field-name-field-oblast-i-grad .field-item')]
        frame = page.select_one('.field-name-field-karta iframe')
        map_url = frame.get('src', '') if frame else ''
        point, precision = coordinates(map_url)
        return {'id': 'bts-' + article['id'].removeprefix('node-'), 'number': row.select_one('.obekt-nomer .field-content').get_text(strip=True),
                'bg': link.get_text(' ', strip=True), 'regionBg': areas[0] if areas else '', 'locationBg': ', '.join(areas[1:]),
                'source': source, 'coordinates': point, 'coordinateMethod': precision, 'mapSource': map_url}

    with ThreadPoolExecutor(max_workers=2) as pool:
        places = []
        for place in pool.map(collect, rows):
            places.append(place)
            if len(places) % 25 == 0:
                print(f'Collected {len(places)}/{len(rows)} official entries', flush=True)
    (args.cache_dir / 'catalogue-review.json').write_text(json.dumps(places, ensure_ascii=False, indent=2) + '\n')
    print('Coordinate review:', {key: sum(p['coordinateMethod'] == key for p in places) for key in sorted({p['coordinateMethod'] for p in places})}, flush=True)


def geography():
    from shapely.geometry import shape, mapping, box
    bounds = box(22, 41, 29, 44.5)
    base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
    layers = {}
    for name, file in [('regions', 'ne_10m_admin_1_states_provinces'), ('countries', 'ne_10m_admin_0_countries'), ('rivers', 'ne_10m_rivers_lake_centerlines'), ('cities', 'ne_10m_populated_places')]:
        source = json.loads(fetch(base + file + '.geojson'))
        features = []
        for feature in source['features']:
            props = feature['properties']
            if name == 'regions' and props.get('adm0_a3') != 'BGR':
                continue
            geometry = shape(feature['geometry'])
            if not geometry.intersects(bounds):
                continue
            if name == 'cities' and props.get('ADM0_A3') != 'BGR':
                continue
            clipped = geometry.intersection(bounds).simplify(.003, preserve_topology=True)
            label = props.get('name') or props.get('NAME') or ''
            features.append({'type': 'Feature', 'properties': {'name': label, 'bg': props.get('name_bg') or label}, 'geometry': mapping(clipped)})
        layers[name] = {'type': 'FeatureCollection', 'features': features}
        print(name, len(features), flush=True)
    destination = ROOT / 'portal/src/data/bulgaria-geography.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Reduce coordinate precision without changing labels or geometry types.
    def rounded(value):
        if isinstance(value, float): return round(value, 5)
        if isinstance(value, (list, tuple)): return [rounded(x) for x in value]
        if isinstance(value, dict): return {key: rounded(x) for key, x in value.items()}
        return value
    destination.write_text(json.dumps(rounded(layers), ensure_ascii=False, separators=(',', ':')) + '\n')


if args.geography:
    geography()
else:
    collect_catalogue()
