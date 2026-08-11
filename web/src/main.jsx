import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import Fellestall from './fellestall/Fellestall.jsx'
import './index.css'

/**
 * Fellestall er forsiden. Det opprinnelige analyseverktøyet – med
 * Stortingets voteringer og virksomhetsnivået, som ikke har fått plass i den
 * nye visningen ennå – ligger på #klassisk. Det lastes bare når det brukes,
 * slik at CSS-en ikke blander seg inn i forsiden.
 */
const Klassisk = lazy(() => import('./App.jsx'))
const visKlassisk = window.location.hash.includes('klassisk')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {visKlassisk ? (
      <Suspense fallback={<p style={{ padding: 40 }}>Laster …</p>}>
        <Klassisk />
      </Suspense>
    ) : (
      <Fellestall />
    )}
  </React.StrictMode>
)
