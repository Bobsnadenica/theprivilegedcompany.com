import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

export function createExplorerMap(container, geography, onSelect) {
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bounds = L.latLngBounds([41.18, 22.28], [44.23, 28.68]);
  const map = L.map(container, { minZoom: 5.5, maxZoom: 11, zoomSnap: .5, maxBounds: [[40.8, 21.8], [44.7, 29.2]], maxBoundsViscosity: .8, preferCanvas: true, zoomAnimation: motion, fadeAnimation: motion, markerZoomAnimation: motion, inertia: motion, scrollWheelZoom: false, trackResize: false });
  map.createPane('cityLabels').style.zIndex = '450';
  L.geoJSON(geography.countries, { interactive: false, style: { stroke: false, fillColor: '#1a2726', fillOpacity: 1 } }).addTo(map);
  L.geoJSON(geography.regions, { style: { color: '#78847a', weight: .7, opacity: .65, fillColor: '#35483a', fillOpacity: .95 }, onEachFeature(feature, layer) {
    const label=document.createElement('span');label.textContent=`${feature.properties.name} · ${feature.properties.bg}`;layer.bindTooltip(label,{sticky:true,className:'explorer-region'});
  } }).addTo(map);
  L.geoJSON(geography.rivers, { interactive: false, style: { color: '#6b9fa9', weight: 1.4, opacity: .75 } }).addTo(map);
  function cityLayer(major) { return L.geoJSON(geography.cities, { filter: feature => ['Sofia','Plovdiv','Varna','Burgas','Ruse'].includes(feature.properties.name) === major, pointToLayer: (feature, point) => {
    const name = document.createElement('span'); name.textContent = feature.properties.name;
    return L.circleMarker(point, { radius: 2, color: '#e1dec9', weight: 1, fillOpacity: 1, interactive: false }).bindTooltip(name, { permanent: true, direction: 'right', className: 'explorer-city', offset: [4, 0], pane:'cityLabels' });
  } }); }
  cityLayer(true).addTo(map);const cities=cityLayer(false);
  const cluster = L.markerClusterGroup({ showCoverageOnHover: false, animate: motion, maxClusterRadius: 48, spiderfyOnMaxZoom: true,
    iconCreateFunction(group) {
      const pins = group.getAllChildMarkers(), visited = pins.filter(p => p.options.visited).length;
      const badge = document.createElement('span'); badge.className = 'cluster-count'; badge.textContent = String(pins.length); badge.style.setProperty('--visited', `${visited / pins.length * 100}%`);
      badge.setAttribute('aria-label', `${pins.length} places, ${visited} visited. Zoom to explore.`);
      return L.divIcon({ html: badge, className: 'landmark-cluster', iconSize: [46, 46] });
    },
  }).addTo(map);
  let markers = new Map();
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/about/terms-of-use/">Natural Earth</a> · <a href="https://www.btsbg.org/node/338">BTS</a> · <a href="https://www.openstreetmap.org/copyright">OSM contributors</a>');
  function reset() { map.invalidateSize({ pan: true, animate: false }); map.fitBounds(bounds, { padding: [15, 15], animate: false }); }
  reset();
  // Leaflet measures a newly unhidden panel after layout, not during tab switching.
  let previousWidth=container.clientWidth;
  const observer = new ResizeObserver(() => {const width=container.clientWidth;if(!width)return;if(width!==previousWidth){previousWidth=width;reset()}else map.invalidateSize({pan:true,animate:false})}); observer.observe(container);
  const cityVisibility=()=>{ if (map.getZoom() < 7.5) { if (map.hasLayer(cities)) map.removeLayer(cities); } else if (!map.hasLayer(cities)) cities.addTo(map); };
  map.on('zoomend', cityVisibility);cityVisibility();
  return {
    reset,
    setPlaces(places, visits, selected) {
      cluster.clearLayers(); markers.clear();
      for (const place of places) {
        const visited = visits.has(place.id), icon = document.createElement('span');
        icon.className = `landmark-pin ${visited ? 'visited' : ''} ${place.id === selected ? 'selected' : ''}`;
        icon.textContent = visited ? '✓' : '·';icon.setAttribute('aria-hidden','true');
        const label=`${place.name}, ${visited ? 'visited' : 'not visited'}`;
        const marker = L.marker([place.lat, place.lon], { visited, title: label, icon: L.divIcon({ html: icon, className: 'landmark-marker', iconSize: [44, 44], iconAnchor: [22, 22] }) });
        marker.on('add',()=>{const node=marker.getElement();node?.setAttribute('aria-label',label);node?.setAttribute('aria-pressed',String(place.id===selected))});
        marker.on('click', () => onSelect(place.id)); markers.set(place.id, marker); cluster.addLayer(marker);
      }
    },
    focusPlace(id) { const marker = markers.get(id); if (marker) cluster.zoomToShowLayer(marker, () => { map.panTo(marker.getLatLng(), { animate: motion }); }); },
    destroy() { observer.disconnect(); map.remove(); markers.clear(); },
  };
}
