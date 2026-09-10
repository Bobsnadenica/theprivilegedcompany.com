import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import {distanceKm, formatDistance} from './explorer-location.js';

export const SATELLITE_URL = 'https://wmts.terrascope.be/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=esa-worldcover-s2rgbnir-10m-2021-v2_tcc&STYLE=default&FORMAT=image/png&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&TIME=2021-01-01';
const satelliteCredit = '<a href="https://esa-worldcover.org/en/data-access">© ESA WorldCover project 2021</a> / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium · <a href="https://terrascope.be">Terrascope</a>';
const symbols = {'Nature':'△','Faith':'✧','Archaeology':'⌂','Arts & culture':'◇','Science':'✳','History':'⌂'};
export function createExplorerMap(container, geography, onSelect, onState = () => {}) {
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bounds = L.latLngBounds([41.18, 22.28], [44.23, 28.68]);
  // MarkerCluster requires an integer minimum zoom to retain unclustered pins.
  const map = L.map(container, { minZoom: 5, maxZoom: 16, zoomSnap: .5, maxBounds: [[40.8, 21.8], [44.7, 29.2]], maxBoundsViscosity: .8, preferCanvas: true, zoomAnimation: motion, fadeAnimation: motion, markerZoomAnimation: motion, inertia: motion, scrollWheelZoom: false, trackResize: false });
  map.createPane('cityLabels').style.zIndex = '450';
  const countries = L.geoJSON(geography.countries, { interactive: false, style: { stroke: false, fillColor: '#213330', fillOpacity: 1 } }).addTo(map);
  const regions = L.geoJSON(geography.regions, { style: { color: '#95a489', weight: .8, opacity: .55, fillColor: '#405841', fillOpacity: .9 }, onEachFeature(feature, layer) {
    const label = document.createElement('span'); label.textContent = `${feature.properties.name} · ${feature.properties.bg}`;
    layer.bindTooltip(label, {sticky:true,className:'explorer-region'});
  } }).addTo(map);
  const rivers = L.geoJSON(geography.rivers, { interactive: false, style: { color: '#79afb8', weight: 1.5, opacity: .75 } }).addTo(map);
  function cityLayer(major) { return L.geoJSON(geography.cities, { filter: feature => ['Sofia','Plovdiv','Varna','Burgas','Ruse'].includes(feature.properties.name) === major, pointToLayer: (feature, point) => {
    const name = document.createElement('span'); name.textContent = feature.properties.name;
    return L.circleMarker(point, { radius: 2, color: '#e1dec9', weight: 1, fillOpacity: 1, interactive: false }).bindTooltip(name, { permanent: true, direction: 'right', className: 'explorer-city', offset: [4, 0], pane:'cityLabels' });
  } }); }
  cityLayer(true).addTo(map); const cities = cityLayer(false);
  let style = 'auto', satelliteOn = false, failed = false, destroyed = false, tileTimer, errors = 0, location = null, locationLayer;
  const satellite = L.tileLayer(SATELLITE_URL, {minNativeZoom:6,maxNativeZoom:14,maxZoom:16,bounds,noWrap:true,keepBuffer:1,updateWhenIdle:true,attribution:satelliteCredit});
  function notify(message = '') { onState({style,satellite:satelliteOn,message,failed}); }
  function geographyStyle() {
    countries.setStyle({fillOpacity:satelliteOn ? 0 : 1});
    regions.setStyle({fillOpacity:satelliteOn ? 0 : .9,opacity:satelliteOn ? .35 : .55});
    rivers.setStyle({opacity:satelliteOn ? .2 : .75});
  }
  function failImagery() {
    if (!satelliteOn || destroyed) return;
    failed = true; satelliteOn = false; map.removeLayer(satellite); clearTimeout(tileTimer); geographyStyle();
    notify('Satellite imagery is unavailable right now. The map still works. Select Satellite to retry.');
  }
  satellite.on('loading', () => {
    errors = 0; clearTimeout(tileTimer);
    tileTimer = setTimeout(failImagery, 25000);
    notify('Loading satellite imagery…');
  });
  satellite.on('tileerror', () => { if (++errors >= 3) failImagery(); });
  satellite.on('load', () => { clearTimeout(tileTimer); if (errors) failImagery(); else if (satelliteOn) notify('2021 satellite imagery · 10 m resolution. Not a live view.'); });
  function updateStyle() {
    const active = !failed && (style === 'satellite' || style === 'auto' && map.getZoom() >= 9);
    if (active !== satelliteOn) {
      satelliteOn = active; geographyStyle();
      if (active) satellite.addTo(map); else { map.removeLayer(satellite); clearTimeout(tileTimer); }
    }
    if (!failed) notify(active ? satellite.isLoading() ? 'Loading satellite imagery…' : '2021 satellite imagery · 10 m resolution. Not a live view.' : '');
    if (map.getZoom() < 7.5) { if (map.hasLayer(cities)) map.removeLayer(cities); } else if (!map.hasLayer(cities)) cities.addTo(map);
  }
  const cluster = L.markerClusterGroup({ showCoverageOnHover: false, animate: motion, maxClusterRadius: 48, disableClusteringAtZoom:14, spiderfyOnMaxZoom: true,
    iconCreateFunction(group) {
      const pins = group.getAllChildMarkers(), visited = pins.filter(p => p.options.visited).length;
      const badge = document.createElement('span'); badge.className = 'cluster-count'; badge.textContent = String(pins.length); badge.style.setProperty('--visited', `${visited / pins.length * 100}%`);
      return L.divIcon({ html: badge, className: 'landmark-cluster', iconSize: [46, 46] });
    },
  }).addTo(map);
  const markers = new Map(); let lastSignature = '';
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/about/terms-of-use/">Natural Earth</a> · <a href="https://www.btsbg.org/node/338">BTS</a> · <a href="https://www.openstreetmap.org/copyright">OSM contributors</a>');
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  function reset() { map.invalidateSize({ pan: true, animate: false }); map.fitBounds(bounds, { padding: [20, 20], animate: false }); }
  reset();
  let previousWidth = container.clientWidth;
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth; if (!width) return;
    if (width !== previousWidth && map.getZoom() < 8) { previousWidth = width; reset(); }
    else { previousWidth = width; map.invalidateSize({pan:true,animate:false}); }
  }); observer.observe(container);
  map.on('zoomend', updateStyle); updateStyle();
  return {
    reset,
    setStyle(value) { if (!['auto','overview','satellite'].includes(value)) return; style = value; failed = false; updateStyle(); },
    setLocation(value) {
      location = value; if (locationLayer) map.removeLayer(locationLayer); locationLayer = null;
      if (value) {
        const point = [value.lat,value.lon];
        locationLayer = L.layerGroup([
          L.circle(point,{radius:value.accuracy||30,color:'#8dcaff',weight:1,fillOpacity:.12,interactive:false}),
          L.circleMarker(point,{radius:7,color:'white',weight:3,fillColor:'#438de0',fillOpacity:1}).bindTooltip('Your approximate location'),
        ]).addTo(map);
      }
      lastSignature = '';
    },
    setPlaces(places, visits, selected) {
      // Reuse markers when selection changes. Clearing clusters makes the map jump.
      const signature = places.map(p => `${p.id}:${visits.has(p.id)}`).join('|');
      if (signature !== lastSignature) {
        cluster.clearLayers(); markers.clear();
        lastSignature = signature;
      }
      for (const place of places) {
        const visited = visits.has(place.id), selectedPlace = place.id === selected;
        let marker = markers.get(place.id);
        const label = `${place.name}, ${visited ? 'visited' : 'not visited'}`;
        const update = !marker || marker.options.visited !== visited || marker.options.selectedPlace !== selectedPlace;
        if (!marker) {
          marker = L.marker([place.lat,place.lon],{title:label,alt:label});
          marker.on('click',()=>onSelect(place.id));
          marker.on('add',()=>{const node=marker.getElement();node?.setAttribute('aria-label',marker.options.title);node?.setAttribute('aria-pressed',String(marker.options.selectedPlace))});
          markers.set(place.id,marker);
        }
        if (update) {
          const icon = document.createElement('span'); icon.className = `landmark-pin ${visited?'visited':''} ${selectedPlace?'selected':''}`; icon.textContent = visited ? '✓' : symbols[place.category] || '◇'; icon.setAttribute('aria-hidden','true');
          Object.assign(marker.options,{visited,selectedPlace,title:label});
          marker.setIcon(L.divIcon({html:icon,className:'landmark-marker',iconSize:[44,44],iconAnchor:[22,22]}));
          marker.getElement()?.setAttribute('aria-pressed',String(selectedPlace));
          marker.getElement()?.setAttribute('aria-label',label);
        }
        const tooltip = document.createElement('span');tooltip.textContent = `${place.name}${location ? ` · ${formatDistance(distanceKm(location,place))} away` : ''}`;
        marker.unbindTooltip().bindTooltip(tooltip,{direction:'top',offset:[0,-13],className:'explorer-place-tooltip'});
        if (!cluster.hasLayer(marker)) cluster.addLayer(marker);
      }
      cluster.refreshClusters();
    },
    focusPlace(id, close = false) {
      const marker = markers.get(id); if (!marker) return;
      if (close) map.setView(marker.getLatLng(),14,{animate:motion});
      else cluster.zoomToShowLayer(marker,()=>map.panTo(marker.getLatLng(),{animate:motion}));
    },
    destroy() { destroyed = true; clearTimeout(tileTimer); observer.disconnect(); map.remove(); markers.clear(); },
  };
}
