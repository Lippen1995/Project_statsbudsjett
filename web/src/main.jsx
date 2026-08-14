import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import Fellestall from './fellestall/Fellestall.jsx'
import './index.css'

/*
 * Fellestall er hele nettstedet. Det opprinnelige analyseverktøyet (App.jsx og
 * components/) er IKKE lenger nåbart: én offentlig flate betyr ett design å
 * holde tilgjengelig. Stortingets voteringer og virksomhetsnivået finnes bare
 * der, og skal migreres inn i forsiden – til da ligger filene i repoet som
 * referanse for migreringen, ikke som død kode ved en forglemmelse.
 */
hydrateRoot(document.getElementById('root'),
  <React.StrictMode>
    <Fellestall />
  </React.StrictMode>
)
