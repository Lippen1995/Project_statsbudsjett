import React from 'react'
import './Footer.css'

export default function Footer({ meta, onVisOmTallene }) {
  if (!meta) return null
  const oppdatert = meta.oppdatert
    ? new Date(meta.oppdatert).toLocaleDateString('nb-NO', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-attributt">
          {meta.kilder?.map(k => (
            <span key={k.navn}>
              Data: <a href={k.url} target="_blank" rel="noopener noreferrer">{k.navn}</a>
              {' '}({k.lisens})
            </span>
          ))}
        </div>
        <div className="footer-hoyre">
          {onVisOmTallene && (
            <button className="footer-lenke" onClick={onVisOmTallene}>Om tallene</button>
          )}
          {oppdatert && <span className="footer-dato">Sist oppdatert: {oppdatert}</span>}
        </div>
      </div>
    </footer>
  )
}
