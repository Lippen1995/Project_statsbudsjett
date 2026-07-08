// Konvensjonelle partifarger (norske partier). Fallback for ukjente.
const FARGER = {
  'Arbeiderpartiet': '#e2001a',
  'Høyre': '#0065f1',
  'Fremskrittspartiet': '#005799',
  'Senterpartiet': '#00843d',
  'Sosialistisk Venstreparti': '#eb2e3e',
  'Venstre': '#00807b',
  'Kristelig Folkeparti': '#ffbe00',
  'Miljøpartiet De Grønne': '#4b7f2d',
  'Rødt': '#8b0000',
  'Pasientfokus': '#7a5195',
}

// Vanlige forkortelser → fullt navn (Stortinget bruker fulle navn, men vær robust)
const ALIAS = {
  'Ap': 'Arbeiderpartiet', 'H': 'Høyre', 'FrP': 'Fremskrittspartiet',
  'Sp': 'Senterpartiet', 'SV': 'Sosialistisk Venstreparti', 'V': 'Venstre',
  'KrF': 'Kristelig Folkeparti', 'MDG': 'Miljøpartiet De Grønne', 'R': 'Rødt',
}

export function partiFarge(navn) {
  const fullt = ALIAS[navn] || navn
  return FARGER[fullt] || '#9ca3af'
}

const KORT = {
  'Arbeiderpartiet': 'Ap', 'Høyre': 'H', 'Fremskrittspartiet': 'FrP',
  'Senterpartiet': 'Sp', 'Sosialistisk Venstreparti': 'SV', 'Venstre': 'V',
  'Kristelig Folkeparti': 'KrF', 'Miljøpartiet De Grønne': 'MDG', 'Rødt': 'R',
}

export function partiKort(navn) {
  return KORT[navn] || navn
}
