// Only reviewed, attributed public photos are used in browsing cards.
export function publicPhoto(value) {
  const safe = (url, hosts) => {
    try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && hosts.includes(parsed.hostname); }
    catch { return false; }
  };
  return value && value.author && value.license &&
    safe(value.url, ['upload.wikimedia.org', 'thumb.wikimedia.org']) &&
    safe(value.page, ['commons.wikimedia.org']) &&
    safe(value.licenseUrl, ['creativecommons.org']) ? value : null;
}

export function placeMedia(place, value) {
  const photo = publicPhoto(value), media = document.createElement('span');
  media.className = 'place-media';
  media.dataset.category = place.category;
  const fallback = document.createElement('span');
  fallback.className = 'place-media-fallback';
  const icon = document.createElement('span');
  icon.className = 'place-media-symbol'; icon.textContent = '◇'; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = 'No preview photo';
  fallback.append(icon, label); media.append(fallback);
  if (photo) {
    const img = document.createElement('img');
    img.alt = photo.alt || place.name; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onload = () => { media.classList.add('has-photo'); };
    img.onerror = () => { img.remove(); media.classList.remove('has-photo'); };
    img.src = photo.url; media.append(img);
  }
  return media;
}

export function photoCredit(value) {
  const photo = publicPhoto(value);
  if (!photo) return null;
  const credit = document.createElement('span'); credit.className = 'card-photo-credit';
  const author = document.createElement('a'), license = document.createElement('a');
  author.href = photo.page; author.textContent = photo.author;
  license.href = photo.licenseUrl; license.textContent = photo.license;
  for (const link of [author, license]) { link.target = '_blank'; link.rel = 'noopener'; }
  credit.append(document.createTextNode('Photo: '), author, document.createTextNode(' · '), license);
  return credit;
}
