// Reverse geocoding via OpenStreetMap Nominatim (no API key required).
// Nominatim's usage policy asks for a descriptive User-Agent and <=1 req/sec,
// so we cluster nearby photos first and throttle calls.

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

function userAgent() {
  return process.env.NOMINATIM_USER_AGENT || 'auto-journal-web';
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Turns time-ordered located photos into a de-duplicated place trail.
 * @param {Array<{lat:number, lon:number, taken_at:string|null}>} located
 * @returns {Promise<Array<{name:string, time:string|null, lat:number, lon:number}>>}
 */
export async function placeTrail(located, { clusterRadius = 500 } = {}) {
  const points = located
    .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
    .sort((a, b) => new Date(a.taken_at || 0) - new Date(b.taken_at || 0));
  if (!points.length) return [];

  // Sequential clustering.
  const clusters = [];
  for (const p of points) {
    const last = clusters.at(-1)?.at(-1);
    if (last && distanceMeters(last, p) <= clusterRadius) {
      clusters.at(-1).push(p);
    } else {
      clusters.push([p]);
    }
  }

  const visits = [];
  for (const cluster of clusters) {
    const centroid = {
      lat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
      lon: cluster.reduce((s, p) => s + p.lon, 0) / cluster.length,
    };
    const firstSeen = cluster.map((p) => p.taken_at).filter(Boolean).sort()[0] || null;
    const name = await reverseGeocode(centroid.lat, centroid.lon);
    if (name && visits.at(-1)?.name !== name) {
      visits.push({ name, time: firstSeen, lat: centroid.lat, lon: centroid.lon });
    }
    await sleep(1100); // respect Nominatim rate limit
  }
  return visits;
}

export async function reverseGeocode(lat, lon) {
  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const specific = a.attraction || a.building || a.neighbourhood || a.suburb || a.road || data.name;
    const city = a.city || a.town || a.village || a.county;
    if (specific && city && specific !== city) return `${specific}, ${city}`;
    return specific || city || a.state || a.country || null;
  } catch {
    return null;
  }
}
