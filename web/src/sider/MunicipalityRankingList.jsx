import React from "react";

export default function MunicipalityRankingList({ rows, selectedCode, renderValue, onOpen, openLabel, renderHover }) {
  const maximum = Math.max(0, ...rows.map((row) => Math.abs(row.a ?? 0)));
  const RowContent = onOpen ? "button" : "div";
  return (
    <div className="cmp-rankings">
      {rows.map((row) => (
        <div key={row.code} className={`cmp-ranking-row ${row.code === selectedCode ? "own" : ""}`}>
          <RowContent className="cmp-rank-trigger" {...(onOpen && {
            type: "button", "aria-haspopup": "dialog", "aria-label": openLabel(row), onClick: () => onOpen(row),
          })}>
            <span className="cmp-rank-heading">
              <span>{row.own.name}</span>
              <span>{renderValue(row)}</span>
            </span>
            <span className="cmp-rank-track" aria-hidden="true">
              <span style={{ width: `${maximum ? Math.abs(row.a ?? 0) / maximum * 100 : 0}%` }} />
            </span>
          </RowContent>
          {renderHover && <div className="cmp-rank-hover">{renderHover(row)}</div>}
        </div>
      ))}
    </div>
  );
}
