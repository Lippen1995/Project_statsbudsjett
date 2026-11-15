import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import Fellestall from './fellestall/Fellestall.jsx'
import AnalyseApp from './analyser/AnalyseApp.jsx'
import ProductApp from './products/ProductApp.jsx'
import './index.css'
import './products/products.css'
import './analyser/analyser.css'
import { startTelemetry } from './lib/telemetry.js'

startTelemetry()

const isProduct = /^\/hjelper-deg(?:\/|$)/.test(window.location.pathname)
const isAnalysis = /^\/analyser(?:\/|$)/.test(window.location.pathname)
hydrateRoot(document.getElementById('root'),
  <React.StrictMode>
    {isProduct ? <ProductApp {...(window.__FELLESTALL_PRODUCTS__ ?? {notFound:true})}/> : isAnalysis ? <AnalyseApp {...(window.__FELLESTALL_ANALYSES__ ?? { notFound: true })} /> : <Fellestall />}
  </React.StrictMode>
)
