import React, {useEffect, useMemo, useState} from 'react'
import {api} from '../lib/api.js'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import 'highcharts/modules/xrange'
import DateTimeRangePicker from './DateTimeRangePicker.jsx'

Highcharts.setOptions({
  time: {useUTC: false},
})

function toUnixSeconds(ms) {
  return Math.floor(ms / 1000)
}

function fmtDateTime(ms) {
  return new Date(ms).toLocaleString()
}

function actionKind(action) {
  const a = String(action || '').toLowerCase()
  if (a === 'set') return 'add'
  if (a === 'unset') return 'remove'
  return 'unknown'
}

function normalizeCreatedAtToMs(createdAt) {
  const n = Number(createdAt)
  if (!Number.isFinite(n)) return Date.now()

  // your API: unix seconds (float) => ms
  if (n < 10_000_000_000) return Math.round(n * 1000)

  // if you ever send ms in future
  return Math.round(n)
}

/**
 * Build tag intervals from history:
 * - on "add": open interval if not open
 * - on "remove": close interval if open
 */
function buildTagIntervals(history, fromMs, toMs) {
  const byTagId = new Map()
  const intervals = []

  const sorted = [...history].sort((a, b) => normalizeCreatedAtToMs(a.createdAt) - normalizeCreatedAtToMs(b.createdAt))

  for (const h of sorted) {
    if (!h.tagId) continue
    const t = h.tag || {id: h.tagId, name: String(h.tagId), description: '', persistent: 0, color: null}
    const ms = normalizeCreatedAtToMs(h.createdAt)
    const kind = actionKind(h.action)

    const state = byTagId.get(h.tagId)

    if (kind === 'add') {
      if (!state) byTagId.set(h.tagId, {openStartMs: ms, tag: t})
    } else if (kind === 'remove') {
      if (state) {
        intervals.push({
          tagId: h.tagId,
          name: state.tag?.name || String(h.tagId),
          description: state.tag?.description || '',
          persistent: state.tag?.persistent || 0,
          color: state.tag?.color || null,

          // chart window (clamped)
          startMs: Math.max(state.openStartMs, fromMs),
          endMs: Math.min(ms, toMs),

          // real interval (for tooltip)
          realStartMs: state.openStartMs,
          realEndMs: ms,
        })
        byTagId.delete(h.tagId)
      } else {
        // fallback: no known "add" (should be rare now)
        intervals.push({
          tagId: h.tagId,
          name: t?.name || String(h.tagId),
          description: t?.description || '',
          persistent: t?.persistent || 0,
          color: t?.color || null,

          startMs: fromMs,
          endMs: Math.min(ms, toMs),

          realStartMs: fromMs,
          realEndMs: ms,
        })
      }
    }
  }

  // close all still-open tags at "to"
  for (const [tagId, state] of byTagId.entries()) {
    intervals.push({
      tagId,
      name: state.tag?.name || String(tagId),
      description: state.tag?.description || '',
      persistent: state.tag?.persistent || 0,
      color: state.tag?.color || null,

      startMs: Math.max(state.openStartMs, fromMs),
      endMs: toMs,

      realStartMs: state.openStartMs,
      realEndMs: toMs,
    })
  }

  return intervals.filter(x => x.endMs > x.startMs)
}

/**
 * Build segment intervals:
 * user can have only one active segment at a time (changes over time)
 * We treat any history item that has segmentId as a "set segment".
 */
function buildSegmentIntervals(history, fromMs, toMs) {
  const noSegment = {id: 0, name: 'No segment', color: 'rgba(255,255,255,0.10)'}

  const sorted = [...history]
    .filter(h => h.segmentId !== undefined && h.segmentId !== null)
    .sort((a, b) => normalizeCreatedAtToMs(a.createdAt) - normalizeCreatedAtToMs(b.createdAt))

  // determine state at "fromMs" using events BEFORE from
  let current = noSegment
  for (const h of sorted) {
    const ms = normalizeCreatedAtToMs(h.createdAt)
    if (ms >= fromMs) break

    const kind = actionKind(h.action)
    if (kind === 'add') {
      current = h.segment || {id: h.segmentId, name: String(h.segmentId), color: null}
    } else if (kind === 'remove') {
      // segment unset => no segment after this
      current = noSegment
    }
  }

  const intervals = []
  let openStartMs = fromMs

  for (const h of sorted) {
    const ms = normalizeCreatedAtToMs(h.createdAt)
    if (ms < fromMs) continue
    if (ms > toMs) break

    const kind = actionKind(h.action)

    // close current interval at event time
    if (ms > openStartMs) {
      intervals.push({
        name: current?.name || String(current?.id ?? ''),
        color: current?.color || null,
        startMs: openStartMs,
        endMs: ms,
        realStartMs: openStartMs,
        realEndMs: ms,
      })
    }

    // update state
    if (kind === 'add') {
      current = h.segment || {id: h.segmentId, name: String(h.segmentId), color: null}
    } else if (kind === 'remove') {
      current = noSegment
    } else {
      // unknown action => ignore state change
    }

    openStartMs = ms
  }

  // close tail to "toMs"
  if (toMs > openStartMs) {
    intervals.push({
      name: current?.name || String(current?.id ?? ''),
      color: current?.color || null,
      startMs: openStartMs,
      endMs: toMs,
      realStartMs: openStartMs,
      realEndMs: toMs,
    })
  }

  return intervals.filter(x => x.endMs > x.startMs)
}

export default function UserHistoryCharts({user, onBack}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [history, setHistory] = useState([])

  const nowMs = Date.now()

  // default window: last 30 days
  // applied (controls chart + request)
  const [appliedFromMs, setAppliedFromMs] = useState(nowMs - 2 * 24 * 3600 * 1000)
  const [appliedToMs, setAppliedToMs] = useState(null)

  // draft (controls inputs only)
  const [draftFromMs, setDraftFromMs] = useState(nowMs - 2 * 24 * 3600 * 1000)
  const [draftToMs, setDraftToMs] = useState(null)

  // const effectiveToMs = toMs ?? autoToMs ?? Date.now()
  const effectiveToMs = appliedToMs ?? Date.now()

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.getUserHistory({
        userId: user.id,
        from: toUnixSeconds(appliedFromMs),
        ...(appliedToMs !== null ? {to: toUnixSeconds(appliedToMs)} : {}),
        limit: 5000,
        offset: 0,
      })

      const items = res?.history ?? []
      setHistory(items)
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('ui:historyFromMs', String(appliedFromMs))
  }, [appliedFromMs])

  useEffect(() => {
    localStorage.setItem('ui:historyToMs', String(appliedToMs ?? ''))
  }, [appliedToMs])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tagIntervals = useMemo(
    () => buildTagIntervals(history.filter(h => h.type === 'tag'), appliedFromMs, effectiveToMs),
    [history, appliedFromMs, effectiveToMs],
  )

  const segmentIntervals = useMemo(
    () => buildSegmentIntervals(history.filter(h => h.type === 'segment'), appliedFromMs, effectiveToMs),
    [history, appliedFromMs, effectiveToMs],
  )

  // Categories (one row per tag)
  const tagCategories = useMemo(() => {
    const names = new Map()
    for (const it of tagIntervals) names.set(it.tagId, it.name)
    return [...names.entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([, name]) => name)
  }, [tagIntervals])

  const tagNameToIndex = useMemo(() => {
    const m = new Map()
    tagCategories.forEach((name, i) => m.set(name, i))
    return m
  }, [tagCategories])

  const tagSeriesData = useMemo(() => {
    return tagIntervals.map(it => ({
      x: it.startMs,
      x2: it.endMs,
      y: tagNameToIndex.get(it.name) ?? 0,
      color: it.color || undefined,
      name: it.name,
      description: it.description || '',
      persistent: it.persistent || 0,

      realStartMs: it.realStartMs ?? it.startMs,
      realEndMs: it.realEndMs ?? it.endMs,
    }))
  }, [tagIntervals, tagNameToIndex])

  const tagsChartOptions = useMemo(() => {
    const rowH = 48
    const baseH = 110
    const chartH = Math.max(280, baseH + tagCategories.length * rowH)
    const barH = Math.max(10, rowH - 10) // bar almost fills the row

    return {
      chart: {
        type: 'xrange',
        height: chartH,
        backgroundColor: 'transparent',
      },
      title: {text: null},
      xAxis: {
        type: 'datetime',
        min: appliedFromMs,
        // max: toMs,
        max: effectiveToMs,
        labels: {
          style: {
            color: 'rgba(255,255,255,0.85)', /* ← white */
            fontSize: '12px',
          },
        },
      },
      yAxis: {
        title: {text: null},
        categories: tagCategories,
        reversed: true,
        minPadding: 0,
        maxPadding: 0,
        labels: {
          style: {
            color: 'rgba(255,255,255,0.85)', /* ← white */
            fontSize: '12px',
          },
        },
      },
      legend: {enabled: false},
      tooltip: {
        formatter: function () {
          const start = fmtDateTime(this.point.realStartMs ?? this.point.x)
          const end = fmtDateTime(this.point.realEndMs ?? this.point.x2)
          const desc = String(this.point.description || '').trim()
          const pers = this.point.persistent ? ' (persistent)' : ' (non-persistent)'
          return `<b>${this.point.name}</b>${pers}` + (desc ? `<br/>${desc}` : '') + `<br/><br/>${start} → ${end}`
        },
      },
      series: [
        {
          name: 'Tags',
          borderColor: 'rgba(0,0,0,0.25)',
          borderWidth: 1,
          data: tagSeriesData,
          pointWidth: barH,
          dataLabels: {
            enabled: true,
            inside: true,
            align: 'center',
            verticalAlign: 'middle',
            style: {
              color: '#fff',
              textOutline: 'none',
              fontSize: '11px',
              fontWeight: '500',
            },
            formatter: function () {
              return this.point.name
            },
          },
        },
      ],
      credits: {enabled: false},
    }
  }, [tagCategories, tagSeriesData, appliedFromMs, effectiveToMs])

  const segmentSeriesData = useMemo(() => {
    return segmentIntervals.map(it => ({
      x: it.startMs,
      x2: it.endMs,
      y: 0,
      color: it.color || undefined,
      name: it.name,
      realStartMs: it.realStartMs,
      realEndMs: it.realEndMs,
    }))
  }, [segmentIntervals])

  const segmentChartOptions = useMemo(() => {
    return {
      chart: {
        type: 'xrange',
        height: 160,
        backgroundColor: 'transparent',
      },
      title: {text: null},
      xAxis: {
        type: 'datetime',
        min: appliedFromMs,
        // max: toMs,
        max: effectiveToMs,
        labels: {
          style: {
            color: 'rgba(255,255,255,0.85)', /* ← white */
            fontSize: '12px',
          },
        },
      },
      yAxis: {
        title: {text: null},
        categories: ['Segment'],
        reversed: true,
        labels: {
          style: {
            color: 'rgba(255,255,255,0.85)', /* ← white */
            fontSize: '12px',
          },
        },
      },
      legend: {enabled: false},
      tooltip: {
        formatter: function () {
          const startMs = this.point.realStartMs != null ? this.point.realStartMs : this.point.x
          const endMs = this.point.realEndMs != null ? this.point.realEndMs : this.point.x2
          const start = fmtDateTime(startMs)
          const end = fmtDateTime(endMs)
          return `<b>${this.point.name}</b><br/><br/>${start} → ${end}`
        },
      },
      series: [
        {
          name: 'Segment',
          borderColor: 'rgba(0,0,0,0.25)',
          borderWidth: 1,
          data: segmentSeriesData,
          dataLabels: {enabled: true, format: '{point.name}'},
        },
      ],
      credits: {enabled: false},
    }
  }, [segmentSeriesData, appliedFromMs, effectiveToMs])

  return (
    <div className="stack">
      <div className="row row--space">
        <div>
          <div className="sectionTitle">User history</div>
          <div className="mutedSmall">
            #{user.id} • {user.email || user.username || ''}
          </div>
        </div>

        <div className="row row--gap">
          <button className="btn btn--ghost" onClick={onBack}>Back</button>
          <button
            className="btn"
            onClick={() => {
              setAppliedFromMs(draftFromMs)
              setAppliedToMs(draftToMs)
              // call load AFTER state update:
              setTimeout(load, 0)
            }}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="row row--space" style={{alignItems: 'flex-end', gap: 12, flexWrap: 'wrap'}}>
        <div className="stack stack--tight" style={{minWidth: 340}}>
          <div className="label">Period</div>

          <div className="row row--gap" style={{alignItems: 'center', flexWrap: 'wrap'}}>
            <DateTimeRangePicker
              fromMs={draftFromMs}
              toMs={draftToMs}
              onChange={({fromMs, toMs}) => {
                setDraftFromMs(fromMs)
                setDraftToMs(toMs)
              }}
              onDone={() => {
                // apply + refresh (same behavior style as Statistics Done)
                setAppliedFromMs(draftFromMs)
                setAppliedToMs(draftToMs)
                setTimeout(load, 0)
              }}
              placeholder="Select date & time range"
              months={2}
            />

            <button
              className="btn btn--ghost btn--small"
              onClick={() => {
                setDraftFromMs(null)
                setDraftToMs(null)
              }}
            >
              Clear
            </button>
          </div>

          <div className="mutedSmall">
            Applied: {appliedFromMs ? new Date(appliedFromMs).toLocaleString(undefined, {hour12: false}) : '—'} → {appliedToMs ? new Date(appliedToMs).toLocaleString(undefined, {hour12: false}) : 'now'}
          </div>
        </div>
      </div>

      <div className="cardInner">
        <div className="cardInner__title">Segment timeline</div>
        <HighchartsReact highcharts={Highcharts} options={segmentChartOptions}/>
      </div>

      <div className="cardInner">
        <div className="cardInner__title">Tags timeline</div>
        <HighchartsReact
          key={`tags-${tagCategories.length}`}
          highcharts={Highcharts}
          options={tagsChartOptions}
        />
      </div>
    </div>
  )
}
