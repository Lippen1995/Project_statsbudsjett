import { Children, isValidElement, useState } from 'react'
import { createPortal } from 'react-dom'

function textOf(children) {
  return Children.toArray(children).map(child => isValidElement(child)
    ? textOf(child.props.children)
    : String(child)).join('')
}
function popupRoot() {
  let root = document.getElementById('admin-popup-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'admin-popup-root'
    root.className = 'ad-popup-stack'
    root.setAttribute('aria-label', 'Varsler')
    document.body.appendChild(root)
  }
  return root
}
let popupSequence = 0
export default function Notice({ children, error = false }) {
  const [sequence] = useState(() => ++popupSequence)
  const [dismissed, setDismissed] = useState(null)
  const message = `${error}:${textOf(children)}`
  if (dismissed === message) return null
  return createPortal(
    <div className={`ad-notice ad-popup ${error ? 'ad-notice-error' : ''}`}
      style={{ order: -sequence }} role={error ? 'alert' : 'status'} aria-atomic="true">
      <div className="ad-popup-content">
        <strong>{error ? 'Handlingen kunne ikke fullføres' : 'Melding'}</strong>
        <div>{children}</div>
      </div>
      <button type="button" className="ad-popup-close" aria-label="Lukk varsel"
        onClick={() => setDismissed(message)}>×</button>
    </div>, popupRoot(),
  )
}
