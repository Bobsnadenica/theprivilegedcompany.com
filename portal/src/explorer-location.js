// Location stays in memory; only explicit check-ins reach account storage.
export function validLocation(value) {
  return !!value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value.lon) && Math.abs(value.lon) <= 180;
}
export function distanceKm(a, b) {
  if (!validLocation(a) || !validLocation(b)) return null;
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function formatDistance(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(10, Math.round(km * 1000 / 10) * 10)} m`;
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}
export function sortPlaces(places, order, location) {
  if (order !== 'nearest' || !validLocation(location)) return [...places];
  return [...places].sort((a, b) => distanceKm(location, a) - distanceKm(location, b));
}
export function googlePlaceUrl(place, directions = false) {
  const query = `${place.bg || place.name}, ${place.location || place.region}, Bulgaria`;
  // Search by name, because some programme pins describe the site area, not its entrance.
  return directions
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export function locationError(error) {
  if (error?.code === 1) return 'Location access was declined. Allow it in your browser settings, then try again. You can still browse every place.';
  if (error?.code === 3) return 'Location took too long. Try again outdoors or with a stronger signal.';
  return 'Your location is unavailable. Check your device location settings and try again.';
}

export function googleSatelliteUrl(place) {
  if (!validLocation(place)) return '';
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${encodeURIComponent(`${place.lat},${place.lon}`)}&zoom=18&basemap=satellite`;
}

export function recommendPlaces(places,visits,location,limit=3) {
  if (!validLocation(location)) return [];
  return sortPlaces(places.filter(place=>!visits.has(place.id)),'nearest',location).slice(0,Math.max(0,Math.min(10,limit)));
}
