import React, { useEffect, useState } from "react";
import { usePurchaseArts, withPurchaseArts } from "./use-purchase-arts";
import { internalHourlyCost, minimumGap, minimumPeers, svenMeasures } from "./sven-measures";
import { entityName, formatNumber as n, percent } from "./workspace-model";

const inputRequests = new Map();
const load = (path) => {
  if (!inputRequests.has(path)) {
    inputRequests.set(path, fetch(path).then((response) => {
      if (!response.ok) throw new Error("Mangler SSB-uttrekk");
      return response.json();
    }).catch((error) => {
      inputRequests.delete(path);
      throw error;
    }));
  }
  return inputRequests.get(path);
};

function moneyRange([min, max]) {
  return min === max ? `${n(min / 1000, 1)} tusen kr` : `${n(min / 1000, 1)}–${n(max / 1000, 1)} tusen kr`;
}

const verdict = {
  review: "Undersøk tiltaket",
  hold: "Ingen kutt anbefalt",
  missing: "For lite datagrunnlag",
  unpriced: "Undersøk uten spareanslag",
};

function Measure({ item, method, peerCount }) {
  const reference = item.referenceLabel ?? (method === "weighted" ? "befolkningsvektet snitt" : "median i utvalget");
  return (
    <article className="cmp-sven-measure">
      <p className="cmp-eyebrow">{verdict[item.status]}</p>
      <h3>{item.title}</h3>
      <p className="cmp-footnote">
        {n(item.own, 2)} mot {n(item.reference.value, 2)} {item.unit} ({reference}).
        {" "}{item.gap !== null && `Avvik ${percent(item.gap * 100)}. `}
        {item.reference.count}/{peerCount} kommuner med data.
      </p>
      {item.status === "hold" ? (
        <p>Jeg finner ikke et stort nok avvik til å foreslå et kutt her.</p>
      ) : item.status === "missing" ? (
        <p>Jeg mangler egne tall eller en brukbar referanse. Behold dagens løsning inntil grunnlaget er bedre.</p>
      ) : (
        <>
          <p>{item.action}</p>
          <p><strong>Før kommunen går videre:</strong> {item.guard}</p>
          {item.saving && (
            <dl className="cmp-sven-estimates">
              <div><dt>Årlig brutto besparelse ved full effekt</dt><dd>{moneyRange(item.saving)}</dd></div>
              <div><dt>Engangskostnad ved innføring</dt><dd>{moneyRange(item.setup)}</dd></div>
            </dl>
          )}
          <details open={!item.saving}>
            <summary>{item.saving ? "Se hvordan Sven regner" : "Hvorfor mangler spareanslaget?"}</summary>
            <p>{item.basis}</p>
            {item.saving && <p>{item.setupReason} Intern tid er priset til {n(internalHourlyCost)} kr per time som en antakelse. Verdien inkluderer bruk av egen kapasitet, som kan ha begrenset direkte budsjetteffekt.</p>}
          </details>
        </>
      )}
      <p className="cmp-footnote">Kilder {item.sources.map((table) => (
        <a key={table} href={`https://www.ssb.no/statbank/table/${table}/`} target="_blank" rel="noreferrer">SSB {table}</a>
      ))}</p>
    </article>
  );
}

export default function SvenMeasures({ target, peers, year, method }) {
  const purchase = usePurchaseArts("120");
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.allSettled([load(`/data/kostra/occupations/${year}.json`), load(`/data/kostra/sven/${year}.json`)])
      .then(([occupations, inputs]) => {
        if (active) setState({
          year, attempt, occupations: occupations.value, inputs: inputs.value,
          error: occupations.status === "rejected" || inputs.status === "rejected",
        });
      });
    return () => { active = false; };
  }, [year, attempt]);
  const ready = state?.year === year && state.attempt === attempt && !purchase.pending;
  if (!ready) return <p role="status">Henter datagrunnlaget for Svens forslag …</p>;

  const rows = svenMeasures({
    target: withPurchaseArts(target, purchase.purchaseArts),
    peers: peers.map((peer) => withPurchaseArts(peer, purchase.purchaseArts)),
    year, method, occupations: state.occupations, inputs: state.inputs,
  });
  const candidates = rows.filter(({ status }) => status === "review" || status === "unpriced");
  return (
    <div className="cmp-sven-measures">
      {(state.error || purchase.error) && (
        <p role="alert">Deler av SSB-uttrekket kunne ikke lastes.{" "}
          <button type="button" onClick={() => { setAttempt((n) => n + 1); if (purchase.error) purchase.retry(); }}>Prøv igjen</button>
        </p>
      )}
      {!candidates.length && <p><strong>Jeg anbefaler ingen kutt ut fra tilgjengelige tall for {entityName(target)}.</strong></p>}
      <p className="cmp-footnote">Sven bruker minst {minimumPeers} kommuner med data og et avvik på minst {n(minimumGap * 100)} % for å foreslå nærmere undersøkelse. Energi per m² sammenlignes med median. Anslagene summeres ikke.</p>
      {[...candidates, ...rows.filter((item) => !candidates.includes(item))].map((item) => (
        <Measure key={item.id} item={item} method={method} peerCount={peers.length} />
      ))}
    </div>
  );
}
