import { geoArea, geoConicConformal, geoPath } from 'd3-geo'

const geometryBase = 'https://ws.geonorge.no/kommuneinfo/v1/kommuner/'
export const mapAttribution = { title: 'Kommunegrenser: Kartverket', url: 'https://www.kartverket.no/api-og-data/kommuneinfo' }

export const geometryPath = value => typeof value === 'string' && value.length <= 20_000 && /^[MLZ0-9., -]+$/.test(value)

function compactPath(path) {
  if (!path || geometryPath(path)) return path
  const rings = [...path.matchAll(/M([^Z]+)Z/g)].map(([, ring]) => ring.split('L').map(point => point.split(',').map(Number)))
  for (const precision of [0.35, 0.75, 1.5, 3]) {
    const output = rings.map(points => {
      const kept = [points[0]]
      for (const point of points.slice(1)) {
        const last = kept.at(-1)
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= precision) kept.push(point)
      }
      return kept.length >= 3 ? 'M' + kept.map(point => point.join(',')).join('L') + 'Z' : ''
    }).join('')
    if (geometryPath(output)) return output
  }
  return null
}

async function municipalityOutline(code, fetchOutline) {
  const response = await fetchOutline(geometryBase + code + '/omrade', { signal: AbortSignal.timeout(5000) })
  if (!response.ok || Number(response.headers.get('content-length')) > 5_000_000) return null
  const { kommunenavn: name, kommunenummer, omrade } = await response.json()
  if (kommunenummer !== code || typeof name !== 'string' || !['Polygon', 'MultiPolygon'].includes(omrade?.type)) return null
  const coordinates = omrade.type === 'Polygon' ? [omrade.coordinates] : omrade.coordinates
  const geometry = { type: 'MultiPolygon', coordinates: coordinates.map(polygon => {
    const object = { type: 'Polygon', coordinates: polygon }
    if (geoArea(object) > 2 * Math.PI) return polygon.map(ring => [...ring].reverse())
    return polygon
  }) }
  return { name, geometry }
}

export async function prepareMunicipalMap(map, fetchOutline = fetch) {
  const located = []
  for (let start = 0; start < map.areas.length; start += 8) {
    const batch = map.areas.slice(start, start + 8)
    const outlines = await Promise.allSettled(batch.map(({ code }) => municipalityOutline(code, fetchOutline)))
    batch.forEach((area, index) => located.push({ ...area, outline: outlines[index].value }))
  }
  const features = located.flatMap(({ outline }) => outline ? [{ type: 'Feature', geometry: outline.geometry }] : [])
  const projection = features.length
    ? geoConicConformal().parallels([59, 70]).rotate([-15, 0])
      .fitExtent([[10, 10], [470, 270]], { type: 'FeatureCollection', features }) : null
  const draw = projection ? geoPath(projection).digits(1) : () => null
  const areas = located.map(({ outline, ...area }) => {
    const path = outline && compactPath(draw(outline.geometry))
    return { ...area, ...(outline ? { name: outline.name.slice(0, 120) } : {}),
      ...(geometryPath(path) ? { path } : {}) }
  })
  return { ...map, areas }
}

// Export requests originate at the client. Only transfer normalized shape attributes.
export function restoreMapGeometry(map, clientMap) {
  return { ...map, areas: map.areas.map(area => {
    const clientArea = clientMap.areas.find(({ code }) => code === area.code)
    return { ...area, ...(typeof clientArea?.name === 'string' ? { name: clientArea.name.slice(0, 120) } : {}),
      ...(geometryPath(clientArea?.path) ? { path: clientArea.path } : {}) }
  }) }
}
