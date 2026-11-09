export const mapAreas = [
  { id: 'harbor', name: 'Harbor District', hint: 'A wide waterfront with public benches and late cafés', x: 18, y: 62 },
  { id: 'lantern', name: 'Lantern Quarter', hint: 'Evening markets and small music rooms', x: 38, y: 34 },
  { id: 'cedar', name: 'Cedar Ridge', hint: 'Parks, bookshops, and slow weekend paths', x: 62, y: 28 },
  { id: 'moonmarket', name: 'Moonmarket', hint: 'Night food stalls and gallery walks', x: 74, y: 58 },
  { id: 'glass', name: 'Glass Orchard', hint: 'Quiet courtyards and weekday studios', x: 46, y: 72 },
  { id: 'northline', name: 'Northline Gardens', hint: 'Community plots and long conversations', x: 28, y: 18 },
]

const assigned = {
  nova: 'harbor',
  sol: 'cedar',
  tide: 'lantern',
  mica: 'glass',
  oren: 'moonmarket',
  juniper: 'northline',
  sable: 'harbor',
  quill: 'lantern',
  moss: 'cedar',
  indigo: 'glass',
  pebble: 'moonmarket',
  lumen: 'northline',
}

export function areaForProfile(id) {
  return assigned[id] || mapAreas[Math.abs(hashCode(id)) % mapAreas.length].id
}

export function areaById(id) {
  return mapAreas.find((area) => area.id === id) || null
}

function hashCode(value) {
  return String(value).split('').reduce((total, char) => total + char.charCodeAt(0), 0)
}
