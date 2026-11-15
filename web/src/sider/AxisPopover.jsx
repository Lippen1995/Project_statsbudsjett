import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoFitAxis, validateAxisBounds } from "./comparison";

export default function AxisPopover({
  axis,
  unit,
  bounds,
  values,
  onApply,
  onClose,
}) {
  const dialog = useRef(null);
  const titleId = useId();
  const [min, setMin] = useState(bounds.min ?? "");
  const [max, setMax] = useState(bounds.max ?? "");
  const [error, setError] = useState("");
  const fit = autoFitAxis(values);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const close = () => onClose();
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("resize", close);
      element.close();
    };
  }, [onClose]);
  const apply = (event) => {
    event.preventDefault();
    const checked = validateAxisBounds(min, max);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    if ((checked.min ?? fit[0]) >= (checked.max ?? fit[1])) {
      setError("Nedre grense må være lavere enn øvre grense.");
      return;
    }
    onApply({ min: checked.min, max: checked.max });
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="ft cmp-axis-popover"
      aria-labelledby={titleId}
      style={{ left: axis.left, top: axis.top }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose();
      }}
    >
      <form onSubmit={apply}>
        <div className="cmp-popover-heading">
          <div>
            <span>Y-akse</span>
            <h5 id={titleId}>{unit}</h5>
          </div>
          <button
            type="button"
            className="cmp-popover-close"
            aria-label="Lukk akseinnstillinger"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="cmp-popover-fields">
          <label>
            Fra
            <input
              autoFocus
              type="number"
              step="any"
              value={min}
              placeholder={String(fit[0])}
              onChange={(e) => setMin(e.target.value)}
            />
          </label>
          <label>
            Til
            <input
              type="number"
              step="any"
              value={max}
              placeholder={String(fit[1])}
              onChange={(e) => setMax(e.target.value)}
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="cmp-popover-actions">
          <button
            type="button"
            onClick={() => onApply({ min: null, max: null })}
          >
            Automatisk
          </button>
          <button type="submit">Bruk</button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
