// Plain JavaScript for <head> (Base.astro), run before the first paint: when the link opens the map
// somewhere other than where this screen starts, it flags <html> and index.css leaves the placeholder
// image out, so a link to Chiang Mai does not flash all of Thailand first. The page is cached for
// every link, so only the browser can tell. It says what isStartView (utils/mapView.ts) says, and
// takes its numbers from there; placeholderGuard.test.ts checks the two agree.
// Imported by astro.config.mjs too, to put this script's hash in the CSP.
import {
  DECIMAL,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  MOBILE_CENTER,
  MOBILE_MIN_WIDTH_PX,
  MOBILE_ZOOM,
} from '../utils/mapView';

export const placeholderGuardScript = `(function () {
  var decimal = new RegExp(${JSON.stringify(DECIMAL.source)});
  var params = new URLSearchParams(location.search);
  function read(name) {
    var value = params.get(name);
    return value !== null && decimal.test(value) ? Number(value) : NaN;
  }
  var lat = read('lat'), lng = read('lng'), zoom = read('zoom');
  var phone = innerWidth < ${MOBILE_MIN_WIDTH_PX};
  var centre = phone ? ${JSON.stringify(MOBILE_CENTER)} : ${JSON.stringify(DEFAULT_CENTER)};
  var startZoom = phone ? ${MOBILE_ZOOM} : ${DEFAULT_ZOOM};
  var hasCentre = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  var hasZoom = zoom >= 0 && zoom <= ${MAX_ZOOM};
  if ((hasCentre && (lng !== centre[0] || lat !== centre[1])) || (hasZoom && Math.max(${MIN_ZOOM}, zoom) !== startZoom)) {
    document.documentElement.setAttribute('data-custom-view', '');
  }
})();`;
