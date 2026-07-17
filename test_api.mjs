import { fetch } from 'node-fetch'; // if we need fetch in node, but node 18+ has it natively.

const PLANET_API_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const VEDASTRO_BASE = 'https://api.vedastro.org/api/Calculate';

function buildTimeSegment(location, time, date, timezone = '+05:30') {
  const encLocation = encodeURIComponent(location);
  const encTz = timezone.replace(/\+/g, '%2B');
  return `Location/${encLocation}/Time/${time}/${date}/${encTz}`;
}

async function fetchPlanetSign(planetName, timeSegment) {
  const url = `${VEDASTRO_BASE}/PlanetRasiD1Sign/Planet/${planetName}/${timeSegment}/Ayanamsa/RAMAN`;
  console.log('Fetching:', url);
  const res = await fetch(url);
  if (!res.ok) {
    console.log('Failed:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  if (data?.Status !== 'Pass') return null;
  return data?.Payload?.PlanetRasiD1Sign;
}

async function fetchPlanetHouse(planetName, timeSegment) {
  const url = `${VEDASTRO_BASE}/HousePlanetOccupiesBasedOnSign/Planet/${planetName}/${timeSegment}/Ayanamsa/RAMAN`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.Status !== 'Pass') return null;
  return data?.Payload?.HousePlanetOccupiesBasedOnSign;
}

async function test() {
  const timeSegment = buildTimeSegment('Mumbai', '08:00', '01/01/1990');
  const results = await Promise.all(
    PLANET_API_NAMES.map(async (planetName) => {
      const sign = await fetchPlanetSign(planetName, timeSegment);
      return { planetName, sign };
    })
  );
  console.log(results);
}
test();
