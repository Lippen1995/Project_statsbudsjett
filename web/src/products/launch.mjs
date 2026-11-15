// Activate only after a product is complete and approved for public launch.
// This single setting controls navigation, sitemap and indexing together.
export const PRODUCTS_LAUNCHED = false
export const PRODUCT_PATHS = ['/hjelper-deg/', '/hjelper-deg/mitt-sameie/']
export function productVisibility(launched = PRODUCTS_LAUNCHED) {
  return { navigation: launched, robots: launched ? 'index, follow' : 'noindex, nofollow', sitemap: launched ? PRODUCT_PATHS : [] }
}
export function productRoute(path) {
  if (path === '/hjelper-deg' || path === '/hjelper-deg/') return { page: 'portal' }
  if (path === '/hjelper-deg/mitt-sameie' || path === '/hjelper-deg/mitt-sameie/') return { page: 'sameie' }
  return { notFound: true }
}
export function productMetadata(props, launched = PRODUCTS_LAUNCHED) {
  const sameie = props.page === 'sameie'
  return {
    title: props.notFound ? 'Siden finnes ikke | Fellestall.no' : sameie ? 'Mitt Sameie – en enklere hverdag i sameiet | Fellestall.no' : 'Fellestall hjelper deg – digitale tjenester | Fellestall.no',
    description: sameie ? 'Mitt Sameie er under utvikling: en digital styre- og beboerplattform for norske eierseksjonssameier. Se hva vi bygger og hvordan oppstarten vil fungere.' : 'Fellestall hjelper deg samler våre digitale tjenester. Først ut er Mitt Sameie, en plattform under utvikling for norske eierseksjonssameier.',
    canonical: `https://fellestall.no${sameie ? PRODUCT_PATHS[1] : PRODUCT_PATHS[0]}`,
    robots: props.notFound ? 'noindex, nofollow' : productVisibility(launched).robots,
  }
}
