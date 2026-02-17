import React, {useEffect, useMemo, useState} from 'react'
import {api} from '../lib/api.js'

function toNumOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function segmentKindBySlug(slug) {
  const s = String(slug || '')
  if (s === 'new_user' || s === 'deposit_only' || s === 'inactive_user') return 'none'
  if (s === 'no_deposit') return 'afterMinutes'
  return 'nrRange'
}

export default function SegmentsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const [timeRangeDays, setTimeRangeDays] = useState(180)
  const [segments, setSegments] = useState([]) // normalized segments with editable options

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.getSegments()
      const list = data?.segments ?? []
      const tr = Number(data?.configs?.timeRangeDays ?? 180)

      setTimeRangeDays(tr)

      // normalize options so inputs are controlled
      setSegments(
        list.map(s => {
          const kind = segmentKindBySlug(s.slug)
          const opt = s.options || {}

          return {
            ...s,
            _kind: kind,
            _afterMinutes: kind === 'afterMinutes' ? String(opt.afterMinutes ?? '') : '',
            _fromNR: kind === 'nrRange' ? String(opt.fromNR ?? '') : '',
            _toNR: kind === 'nrRange' ? String(opt.toNR ?? '') : '',
          }
        }),
      )
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validationErrors = useMemo(() => {
    const errors = []

    const tr = toNumOrNull(timeRangeDays)
    if (tr === null || tr <= 0) errors.push('timeRangeDays must be a number > 0')

    segments.forEach(seg => {
      if (seg._kind === 'afterMinutes') {
        const afterMinutes = toNumOrNull(seg._afterMinutes)
        if (afterMinutes === null || afterMinutes <= 0) {
          errors.push(`Segment "${seg.name}" (${seg.slug}): afterMinutes must be a number > 0`)
        }
        return
      }

      if (seg._kind !== 'nrRange') return

      const fromNR = toNumOrNull(seg._fromNR)
      const toNR = toNumOrNull(seg._toNR)

      // must set at least one (and it must be > 0 in UI terms)
      if (fromNR === null && toNR === null) {
        errors.push(`Segment "${seg.name}" (${seg.slug}): set fromNR or toNR`)
        return
      }

      // forbid 0 (and any non-positive)
      if (fromNR !== null && fromNR === 0) {
        errors.push(`Segment "${seg.name}" (${seg.slug}): fromNR cannot be 0`)
      }
      if (toNR !== null && toNR === 0) {
        errors.push(`Segment "${seg.name}" (${seg.slug}): toNR cannot be 0`)
      }
    })

    return errors
  }, [segments, timeRangeDays])

  async function save() {
    const errors = validationErrors
    if (errors.length) {
      setErr(errors.join('\n'))
      return
    }

    setSaving(true)
    setErr(null)
    try {
      const tr = Number(timeRangeDays)

      const configs = segments.map(seg => {
        const options = {}

        if (seg._kind === 'afterMinutes') {
          const afterMinutes = toNumOrNull(seg._afterMinutes)
          if (afterMinutes !== null && afterMinutes > 0) options.afterMinutes = afterMinutes
        } else if (seg._kind === 'nrRange') {
          const fromNR = toNumOrNull(seg._fromNR)
          const toNR = toNumOrNull(seg._toNR)

          if (fromNR !== null && fromNR !== 0) options.fromNR = fromNR
          if (toNR !== null && toNR !== 0) options.toNR = toNR
        }

        return {segmentId: seg.id, options}
      })

      await api.setupSegments({timeRangeDays: tr, configs})
      await load()
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  function updateSeg(id, patch) {
    setSegments(prev => prev.map(s => (s.id === id ? {...s, ...patch} : s)))
  }

  function SegmentCard({seg}) {
    if (!seg) return null

    console.log(['new_user', 'no_deposit', 'deposit_only'].includes(seg.slug))

    return (
      <div
        className="traceCard"
        style={{
          maxWidth: ['new_user', 'no_deposit', 'deposit_only', 'inactive_user'].includes(seg.slug) ? '260px' : 'default',
          background: seg.color ? `${seg.color}22` : 'rgba(255,255,255,0.05)',
          border: `1px solid ${seg.color ? `${seg.color}55` : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <div className="row row--space" style={{alignItems: 'flex-start', gap: 10}}>
          <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
            <div
              className="dot"
              style={{
                background: seg.color || 'rgba(255,255,255,0.12)',
                height: 28,
                width: 28,
              }}
              title={seg.color || ''}
            />
            <div>
              <div className="group__title" style={{marginBottom: 2}}>
                {seg.name} <span className="badge">{seg.slug}</span>
              </div>
              {seg.description ? <div className="hint">{seg.description}</div> : null}
            </div>
          </div>

          <div className="mutedSmall">#{seg.id}</div>
        </div>
      </div>
    )
  }

  function isWinner(seg) {
    // safest: based on slug naming you already have
    return String(seg?.slug || '').startsWith('net_winner')
  }

  function toNumOrEmpty(v) {
    if (v === '' || v === null || v === undefined) return ''
    const n = Number(v)
    return Number.isFinite(n) ? n : ''
  }

  function formatNrForUi(v) {
    const n = toNumOrEmpty(v)
    if (n === '') return ''
    // winners are negative in BE => show abs
    return String(Math.abs(n))
  }

  function uiToRealNr(seg, uiValue) {
    if (uiValue === '' || uiValue === null || uiValue === undefined) return ''
    const n = Number(uiValue)
    if (!Number.isFinite(n)) return ''
    // allow <=0 while typing (we will block on save)
    return isWinner(seg) ? -Math.abs(n) : Math.abs(n)
  }

  function getBoundaryValue(seg, next) {
    // loser chain: boundary is seg.to == next.from
    // winner chain: boundary is seg.to == next.to? no. actually seg.to == next.to? not true.
    // winner chain: boundary between seg and next is seg.from == next.to (e.g. low.from=-1000 == medium.to=-1000)
    if (isWinner(seg)) {
      // between low and medium -> use seg._fromNR (=-1000), between medium and high -> seg._fromNR (=-8000)
      return seg?._fromNR
    }
    return seg?._toNR
  }

  function setNrBoundary(seg, next, uiValue) {
    const real = uiToRealNr(seg, uiValue)

    if (isWinner(seg)) {
      updateSeg(seg.id, {_fromNR: real})
      updateSeg(next.id, {_toNR: real})
      return
    }

    updateSeg(seg.id, {_toNR: real})
    updateSeg(next.id, {_fromNR: real})
  }

  function setFirstBoundary(firstSeg, uiValue) {
    const real = uiToRealNr(firstSeg, uiValue)

    if (isWinner(firstSeg)) {
      // first boundary near 0 is first.toNR (e.g. low.toNR = 0)
      updateSeg(firstSeg.id, {_toNR: real})
      return
    }

    // losers: first starts from 0 -> first.fromNR
    updateSeg(firstSeg.id, {_fromNR: real})
  }

  return (
    <div className="stack">
      <div className="row row--space">
        <div>
          <div className="sectionTitle">Segments</div>
          <div className="mutedSmall">Configure segment options</div>
        </div>

        <div className="row row--gap">
          <button className="btn" onClick={load} disabled={loading || saving}>
            Refresh
          </button>
          <button className="btn btn--primary" onClick={save} disabled={loading || saving}>
            Save
          </button>
        </div>
      </div>

      {err && (
        <div className="alert alert--error" style={{whiteSpace: 'pre-line'}}>
          {err}
        </div>
      )}

      <div className="card">
        <div className="card__header">
          <div className="card__title">Global config</div>
          <div className="pill">{loading ? 'Loading…' : `${segments.length} segments`}</div>
        </div>

        <div className="grid2" style={{gridTemplateColumns: 'max-content 1fr'}}>
          <div className="field">
            <div className="label">timeRangeDays</div>
            <input
              className="input"
              type="number"
              value={String(timeRangeDays)}
              onChange={e => setTimeRangeDays(e.target.value)}
              style={{
                backgroundColor: 'rgba(227,227,227,0.2)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <div className="card__title">Segments setup</div>
        </div>

        {(() => {
          // backend already sends correct ordering:
          // [0..2] = new_user, no_deposit, deposit_only
          // [3..6] = winners (4 segments)
          // [7..11] = losers (5 segments)
          // [12] = inactive_user (single)
          const firstBlock = segments.slice(0, 3)
          const winners = segments.slice(3, 7)
          const losers = segments.slice(7, 12)
          const inactive = segments[12] || null

          const newUser = firstBlock[0] || null
          const noDeposit = firstBlock[1] || null
          const depositOnly = firstBlock[2] || null

          function renderNrChainVertical(list, title) {
            if (!list.length) return null

            return (
              <div className="traceBlock">
                <div className="traceBlock__title">{title}</div>

                <div className="traceBlock__content">
                  <div className="traceCol">
                    {/* top fixed boundary (0) */}
                    <div className="traceVBetween">
                      <div className="traceVBetween__input" title="Fixed boundary">
                        <input
                          className="input"
                          type="number"
                          value={formatNrForUi(isWinner(list[0]) ? (list[0]._toNR === '' ? 0 : list[0]._toNR) : list[0]._fromNR)}
                          disabled
                          readOnly
                        />
                      </div>
                    </div>

                    {list.map((seg, idx) => {
                      const next = list[idx + 1] || null
                      const isLast = idx === list.length - 1

                      return (
                        <React.Fragment key={seg.id}>
                          <SegmentCard seg={seg}/>

                          {!isLast && next && (
                            <div className="traceVBetween">
                              <div
                                className="traceVBetween__input"
                                title={`sets boundary between ${seg.slug} and ${next.slug}`}
                              >
                                <input
                                  className="input"
                                  type="number"
                                  min="1"
                                  value={formatNrForUi(getBoundaryValue(seg, next))}
                                  onChange={e => setNrBoundary(seg, next, e.target.value)}
                                  placeholder="NR"
                                />
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}

                    {/* bottom fixed infinity */}
                    <div className="traceVBetween">
                      <div className="traceVBetween__input" title="Infinity">
                        <input className="input" type="text" value="∞" disabled readOnly/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div className="stack">
              {/* 1) New User -> (afterMinutes) -> No Deposit -> Deposit Only -> Inactive */}
              <div className="traceRow">
                <SegmentCard seg={newUser}/>

                {noDeposit && (
                  <div className="traceBetween">
                    <div className="traceBetween__input" title={`applies to ${noDeposit.slug}`}>
                      <input
                        className="input"
                        type="number"
                        value={noDeposit._afterMinutes}
                        onChange={e => updateSeg(noDeposit.id, {_afterMinutes: e.target.value})}
                        placeholder="min"
                      />
                    </div>
                    after minutes
                  </div>
                )}

                <SegmentCard seg={noDeposit}/>
                <SegmentCard seg={depositOnly}/>
                <SegmentCard seg={inactive}/>
              </div>

              <br/>
              <div className="traceGrid2">
                {/* 2) Winners */}
                {renderNrChainVertical(winners, 'Net Winners')}
                {/* 3) Losers */}
                {renderNrChainVertical(losers, 'Net Losers')}
              </div>

            </div>
          )
        })()}
      </div>
    </div>
  )
}
