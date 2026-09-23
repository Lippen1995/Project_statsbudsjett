import React, { useId, useState } from 'react'

export default function KostraInfoTooltip({ label, children }) {
  const id = useId()
  const [open, setOpen] = useState(false)

  return (
    <span className="ko-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`Forklaring av ${label}`}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
          }
        }}
      >i</button>
      <span id={id} role="tooltip" className={`ko-tooltip ${open ? 'apen' : ''}`}>{children}</span>
    </span>
  )
}
