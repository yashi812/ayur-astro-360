// Debug: test which endpoint works and check the URL being built
const VEDASTRO_BASE = 'https://api.vedastro.org/api/Calculate';

// Simulate exactly what the browser code does
const city = 'Mumbai';
const timeStr = '08:00';
const dateStr = '01/01/1990';
const timezone = '+05:30';

const encLocation = encodeURIComponent(city);
const encTz = timezone.replace(/\+/g, '%2B');
const normDate = dateStr.replace(/-/g, '/');
const timeSegment = 'Location/' + encLocation + '/Time/' + timeStr + '/' + normDate + '/' + encTz;

const url = VEDASTRO_BASE + '/AllPlanetData/PlanetName/All/' + timeSegment + '/Ayanamsa/RAMAN';
console.log('URL built by JS code:', url);

const res = await fetch(url);
console.log('Status:', res.status);
const data = await res.json();
console.log('API Status:', data.Status);
const list = data?.Payload?.AllPlanetData;
console.log('AllPlanetData is array:', Array.isArray(list), 'length:', list?.length);

if (Array.isArray(list)) {
  for (const item of list.slice(0, 3)) {
    const pName = Object.keys(item)[0];
    const entry = item[pName];
    const rasi = entry.PlanetRasiD1Sign;
    console.log(pName, '-> sign:', rasi?.Name, '| deg:', rasi?.DegreesIn?.DegreeMinuteSecond, '| house:', entry.HousePlanetOccupiesBasedOnSign);
  }
}

// Also test per-planet endpoint with /PlanetName/ (not /Planet/)
console.log('\n--- Testing per-planet sign endpoint ---');
const url2 = VEDASTRO_BASE + '/PlanetRasiD1Sign/PlanetName/Sun/' + timeSegment + '/Ayanamsa/RAMAN';
console.log('URL:', url2);
const res2 = await fetch(url2);
const data2 = await res2.json();
console.log('Status:', data2.Status, 'Payload:', JSON.stringify(data2.Payload));

// Test house endpoint
const url3 = VEDASTRO_BASE + '/HousePlanetOccupiesBasedOnSign/PlanetName/Sun/' + timeSegment + '/Ayanamsa/RAMAN';
console.log('House URL:', url3);
const res3 = await fetch(url3);
const data3 = await res3.json();
console.log('House Status:', data3.Status, 'Payload:', JSON.stringify(data3.Payload));
