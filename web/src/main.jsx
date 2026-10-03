import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import Fellestall from './fellestall/Fellestall.jsx'
import AnalyseApp from './analyser/AnalyseApp.jsx'
import './index.css'
import './analyser/analyser.css'

const isAnalysis = /^\/analyser(?:\/|$)/.test(window.location.pathname)
hydrateRoot(document.getElementById('root'),
  <React.StrictMode>
    {isAnalysis ? <AnalyseApp {...(window.__FELLESTALL_ANALYSES__ ?? { notFound: true })} /> : <Fellestall />}
  </React.StrictMode>
)
