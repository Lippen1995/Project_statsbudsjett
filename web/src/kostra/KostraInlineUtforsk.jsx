import React, { useEffect, useMemo, useRef, useState } from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { RUST } from '../fellestall/design'
import { accountingArtBreakdown, explorerDrillRows, explorerHistory, sortExplorerRows } from './explorer'
import { formatKostraValue, populationForEntity } from './model'

const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

export default function KostraInlineUtforsk({ index, detail, entity, year, scopeName, onExit }) {
  const [path, setPath] = useState({})
  const [sortKey, setSortKey] = useState('perCapita')
  const [sortDirection, setSortDirection] = useState('desc')
  const headingRef = useRef(null)
  const metricRows = useMemo(() => explorerDrillRows(detail, year, {}), [detail, year])
  const rawRows = explorerDrillRows(detail, year, path)
  const artBreakdown = path.metricId === 'expenses' && path.functionCode
    ? accountingArtBreakdown(detail, year, path.functionCode)
    : null
  const shareTotal = rawRows.reduce((sum, item) => sum + Math.abs(item.amount ?? 0), 0)
  const signedValues = rawRows.some((item) => (item.amount ?? 0) < 0)
  const rows = sortExplorerRows(rawRows.map((item) => ({
    ...item,
    share: Number.isFinite(item.share)
      ? item.share
      : Number.isFinite(item.amount) && shareTotal
        ? Math.abs(item.amount) / shareTotal * 100
        : null,
  })), sortKey, sortDirection)
  const history = explorerHistory(detail, index.years, path)
  const population = populationForEntity(index, year, entity.id)
  const selectedMetric = metricRows.find((item) => item.code === path.metricId)
  const selectedService = detail.services?.find((item) => item.code === path.serviceCode)
  const selectedFunction = detail.functions?.find((item) => item.code === path.functionCode)
  const isMetricMenu = !path.metricId
  const thirdSortKey = isMetricMenu ? 'amount' : 'share'
  const thirdHeading = isMetricMenu
    ? 'Totalt'
    : signedValues && !artBreakdown
      ? 'Andel av utslag'
      : 'Andel'
  const maxPerCapita = Math.max(1, ...rows.map((item) => Math.abs(item.perCapita ?? 0)))
  const currentValue = history?.points?.[index.years.indexOf(year)]?.v ?? null
  const levelLabel = isMetricMenu
    ? 'Nøkkeltall'
    : path.functionCode
      ? 'Regnskapsart'
      : path.serviceCode
        ? 'KOSTRA-funksjon'
        : path.metricId === 'revenues'
          ? 'Inntektsart'
          : path.metricId === 'debt'
            ? 'Gjeld'
            : 'Tjenesteområde'

  useEffect(() => {
    if (isMetricMenu && sortKey === 'share') setSortKey('amount')
    if (!isMetricMenu && sortKey === 'amount') setSortKey('share')
  }, [isMetricMenu, sortKey])

  useEffect(() => {
    headingRef.current?.focus()
  }, [path])

  const openRow = (item) => {
    if (item.kind === 'metric') setPath({ metricId: item.code })
    else if (item.kind === 'service') setPath((current) => ({ ...current, serviceCode: item.code }))
    else if (item.kind === 'function') setPath((current) => ({ ...current, functionCode: item.code }))
  }
  const changeSort = (key) => {
    setSortDirection((current) => sortKey === key && current === 'desc' ? 'asc' : 'desc')
    setSortKey(key)
  }
  const sortArrow = (key) => sortKey === key ? (sortDirection === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <div className="ft-utforsk-grid ko-inlineutforsk">
      <div>
        <nav className="ko-inline-smuler" aria-label="Utforskersti">
          <button type="button" onClick={onExit}>{scopeName}</button><span>›</span>
          <button type="button" onClick={() => setPath({})}>{entity.name}</button>
          {selectedMetric && <><span>›</span><button type="button" onClick={() => setPath({ metricId: path.metricId })}>{selectedMetric.name}</button></>}
          {selectedService && <><span>›</span><button type="button" onClick={() => setPath({ metricId: path.metricId, serviceCode: path.serviceCode })}>{selectedService.name}</button></>}
          {selectedFunction && <><span>›</span><span>{selectedFunction.name}</span></>}
        </nav>

        <div className="ft-nivaatopp">
          <span className="ft-nivaasum" tabIndex={-1} ref={headingRef}>{isMetricMenu ? entity.name : selectedFunction?.name ?? levelLabel}</span>
          <span className="ft-nivaamerke">{year} · {path.functionCode ? 'laveste nivå' : 'klikk for å drille videre'}</span>
        </div>

        <div className="ft-tabellhode ko-tabellhode ko-drilltabellhode">
          <span>{levelLabel}</span>
          <button
            type="button"
            className={sortKey === 'perCapita' ? 'aktiv' : ''}
            aria-pressed={sortKey === 'perCapita'}
            onClick={() => changeSort('perCapita')}
          >Per innb.{sortArrow('perCapita')}</button>
          <button
            type="button"
            className={sortKey === thirdSortKey ? 'aktiv' : ''}
            aria-pressed={sortKey === thirdSortKey}
            onClick={() => changeSort(thirdSortKey)}
          >{thirdHeading}{sortArrow(thirdSortKey)}</button>
          <span />
        </div>

        {rows.map((item) => {
          const content = <>
            <span className="ft-utforskmidt">
              <span className="ft-utforsktittel">
                <span className="ft-utforsknavn">{item.name}</span>
                <span className="ft-merke">{item.code}</span>
              </span>
              <span className="ft-bar ft-bar--tynn">
                <span className="ft-bar-fyll" style={{ width: `${Math.abs(item.perCapita ?? 0) / maxPerCapita * 100}%` }} />
              </span>
            </span>
            <span className="num ft-utforskbelop">{formatKostraValue(item.perCapita, 'perCapita')}</span>
            <span className="num ft-utforskandel">
              {isMetricMenu ? formatKostraValue(item.amount, 'amount') : Number.isFinite(item.share) ? `${populationFormat.format(item.share)} %` : '–'}
            </span>
            <span className="ft-utforskpil">{item.clickable ? '›' : ''}</span>
          </>
          return item.clickable ? (
            <button
              type="button"
              className="ft-utforskrad ko-drillrad"
              key={`${item.kind}:${item.code}`}
              onClick={() => openRow(item)}
            >
              {content}
            </button>
          ) : (
            <div className="ft-utforskrad ko-drillrad ko-drillrad--data" key={`${item.kind}:${item.code}`}>
              {content}
            </div>
          )
        })}

        {artBreakdown?.reconciliation.status === 'reconciled' && (
          <p className="ko-artavstemming">Artsgruppene avstemmer mot funksjonens brutto driftsutgifter.</p>
        )}
        {artBreakdown?.reconciliation.status === 'difference' && (
          <p className="ko-artavstemming">
            Artsgruppene summerer til {formatKostraValue(artBreakdown.reconciliation.componentTotal, 'amount')}, mens SSB oppgir {formatKostraValue(artBreakdown.reconciliation.functionTotal, 'amount')} for funksjonen. Avviket på {formatKostraValue(artBreakdown.reconciliation.difference, 'amount')} beholdes synlig fordi publiserte artsgrupper ikke alltid dekker alle posteringer.
          </p>
        )}
        {artBreakdown?.reconciliation.status === 'incomplete-components' && rows.length > 0 && (
          <p className="ko-artavstemming">
            SSB mangler én eller flere hovedarter for denne funksjonen og året. Rapporterte arter vises, men andeler og avstemming utelates fordi manglende verdier ikke kan tolkes som null.
          </p>
        )}
        {artBreakdown && signedValues && (
          <p className="ko-artavstemming">Negative beløp er motposter og vises med fortegn; de er ikke fremstilt som ordinære kostnader.</p>
        )}

        {!rows.length && (
          <p className="ft-tommelding">
            {path.metricId === 'debt'
              ? 'SSBs KOSTRA-grunnlag har ikke en videre fordeling av gjelden.'
              : path.metricId === 'investments' && path.functionCode
                ? 'Regnskapsarter kan ikke knyttes entydig til investeringer i KOSTRA-grunnlaget.'
              : 'Ingen rapporterte regnskapsarter er tilgjengelige på dette nivået for valgt år.'}
          </p>
        )}
      </div>

      <aside className="ft-utforsk-side ko-utforsk-side" aria-live="polite" aria-atomic="true">
        <div className="ko-oppsummering">
          <div className="ft-stikkord">{isMetricMenu ? (entity.kind === 'county' ? 'Fylke' : 'Kommune') : levelLabel}</div>
          <div className="ft-graftittel">{history?.name ?? entity.name}</div>
          {history && <div className="ko-oppsummeringstall num">{formatKostraValue(currentValue, 'amount')}</div>}
          <div className="ko-innbyggere">
            <span>Innbyggere</span>
            <strong className="num">{population == null ? '–' : `ca. ${populationFormat.format(population)}`}</strong>
          </div>
          {isMetricMenu && <p className="ko-datadekning">Velg et nøkkeltall for å utforske regnskapet uten å forlate siden.</p>}
        </div>
        {history && (
          <div className="ft-arealblokk">
            <div className="ft-stikkord">Utvikling over tid</div>
            <div className="ft-kort-graf">
              <LinjeGraf
                serier={[{ navn: history.name, farge: RUST, bredde: 2.5, punkter: history.points }]}
                aar={index.years}
                W={356}
                H={160}
                fraNull={history.fromZero}
                aksefmt={(value) => formatKostraValue(value, 'amount')}
                beskrivelse={`${history.name} for ${entity.name}`}
              />
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
