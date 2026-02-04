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
      if (seg._kind !== 'nrRange') return
      const fromNR = toNumOrNull(seg._fromNR)
      const toNR = toNumOrNull(seg._toNR)

      // must set at least one
      if (fromNR === null && toNR === null) {
        errors.push(`Segment "${seg.name}" (${seg.slug}): set fromNR or toNR`)
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
          if (afterMinutes !== null) options.afterMinutes = afterMinutes
        } else if (seg._kind === 'nrRange') {
          const fromNR = toNumOrNull(seg._fromNR)
          const toNR = toNumOrNull(seg._toNR)
          if (fromNR !== null) options.fromNR = fromNR
          if (toNR !== null) options.toNR = toNR
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
              min="1"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <div className="card__title">Segments setup</div>
        </div>

        <div className="segmentsGrid">
          {segments.map(seg => (
            <div
              key={seg.id}
              className="group"
              style={{
                background: seg.color ? `${seg.color}22` : 'rgba(255,255,255,0.05)',
              }}
            >
              <div className="group__head" style={{alignItems: 'flex-start'}}>
                <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                  <div
                    className="dot"
                    style={{
                      background: seg.color || 'rgba(255,255,255,0.12)',
                      height: 36,
                      width: 36
                    }}
                    title={seg.color || ''}
                  />
                  <div>
                    <div className="group__title">
                      {seg.name} <span className="badge">{seg.slug}</span>
                    </div>
                    {seg.description ? <div className="hint">{seg.description}</div> : null}
                  </div>
                </div>

                <div className="mutedSmall">#{seg.id}</div>
              </div>

              {seg._kind === 'none' && (
                <div className="hint">No options for this segment.</div>
              )}

              {seg._kind === 'afterMinutes' && (
                <div className="grid2" style={{gridTemplateColumns: 'max-content 1fr'}}>
                  <div className="field">
                    <div className="label">afterMinutes</div>
                    <input
                      className="input"
                      type="number"
                      value={seg._afterMinutes}
                      onChange={e => updateSeg(seg.id, {_afterMinutes: e.target.value})}
                      placeholder="e.g. 1501"
                    />
                    <div className="hint">Optional. If empty, backend keeps default.</div>
                  </div>
                </div>
              )}

              {seg._kind === 'nrRange' && (
                <div className="grid2" style={{gridTemplateColumns: '1fr 1fr'}}>
                  <div className="field">
                    <div className="label">fromNR</div>
                    <input
                      className="input"
                      type="number"
                      value={seg._fromNR}
                      onChange={e => updateSeg(seg.id, {_fromNR: e.target.value})}
                      placeholder="optional"
                    />
                  </div>

                  <div className="field">
                    <div className="label">toNR</div>
                    <input
                      className="input"
                      type="number"
                      value={seg._toNR}
                      onChange={e => updateSeg(seg.id, {_toNR: e.target.value})}
                      placeholder="optional"
                    />
                  </div>

                  <div className="hint" style={{gridColumn: '1 / -1'}}>
                    Must set at least one of fromNR / toNR.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
