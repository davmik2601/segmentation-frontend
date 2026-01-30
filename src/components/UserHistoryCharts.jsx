import React, {useEffect, useMemo, useState} from 'react'
import {api} from '../lib/api.js'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import 'highcharts/modules/xrange'

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

function toLocalInputValue(ms) {
  const d = new Date(ms)
  const pad = n => String(n).padStart(2, '0')
  return (
    d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + 'T' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes())
  )
}

/**
 * Build tag intervals from history:
 * - on "add": open interval if not open
 * - on "remove": close interval if open
 */
function buildTagIntervals(history, fromMs, toMs) {
  const byTagId = new Map() // tagId -> {openStartMs, tag}
  const intervals = [] // {tagId, name, color, startMs, endMs}

  const sorted = [...history].sort((a, b) => normalizeCreatedAtToMs(a.createdAt) - normalizeCreatedAtToMs(b.createdAt))

  for (const h of sorted) {
    if (!h.tagId) continue
    const t = h.tag || {id: h.tagId, name: String(h.tagId), color: null}
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
          color: state.tag?.color || null,
          startMs: Math.max(state.openStartMs, fromMs),
          endMs: Math.min(ms, toMs),
        })
        byTagId.delete(h.tagId)
      } else {
        // no "set" inside range -> assume it was already active at fromMs
        intervals.push({
          tagId: h.tagId,
          name: t?.name || String(h.tagId),
          color: t?.color || null,
          startMs: fromMs,
          endMs: Math.min(ms, toMs),
        })
      }
    }
  }

  // close all still-open tags at "to"
  for (const [tagId, state] of byTagId.entries()) {
    intervals.push({
      tagId,
      name: state.tag?.name || String(tagId),
      color: state.tag?.color || null,
      startMs: Math.max(state.openStartMs, fromMs),
      endMs: toMs,
    })
  }

  // filter out invalid intervals
  return intervals.filter(x => x.endMs > x.startMs)
}

/**
 * Build segment intervals:
 * user can have only one active segment at a time (changes over time)
 * We treat any history item that has segmentId as a "set segment".
 */
function buildSegmentIntervals(history, fromMs, toMs) {
  const sorted = [...history]
    .filter(h => h.type === 'segment' && h.action === 'set' && h.segmentId != null)
    .sort((a, b) => normalizeCreatedAtToMs(a.createdAt) - normalizeCreatedAtToMs(b.createdAt))

  const intervals = []
  let open = null // {segment, startMs}

  for (const h of sorted) {
    const ms = normalizeCreatedAtToMs(h.createdAt)
    const seg = h.segment || {id: h.segmentId, name: String(h.segmentId), color: null}

    if (!open) {
      open = {segment: seg, startMs: ms}
      continue
    }

    // close previous at this new set time
    intervals.push({
      name: open.segment?.name || String(open.segment?.id),
      color: open.segment?.color || null,
      startMs: Math.max(open.startMs, fromMs),
      endMs: Math.min(ms, toMs),
    })

    // open new
    open = {segment: seg, startMs: ms}
  }

  // close last to end of window
  if (open) {
    intervals.push({
      name: open.segment?.name || String(open.segment?.id),
      color: open.segment?.color || null,
      startMs: Math.max(open.startMs, fromMs),
      endMs: toMs,
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
  const [fromMs, setFromMs] = useState(() => {
    // const raw = localStorage.getItem('ui:historyFromMs')
    // return raw ? Number(raw) : nowMs - 2 * 24 * 3600 * 1000
    return nowMs - 2 * 24 * 3600 * 1000
  })

  const [toMs, setToMs] = useState(() => {
    // const raw = localStorage.getItem('ui:historyToMs')
    // return raw ? Number(raw) : nowMs
    return null
  })

  const [autoToMs, setAutoToMs] = useState(null)

  // const effectiveToMs = toMs ?? autoToMs ?? Date.now()
  const effectiveToMs = toMs ?? Date.now()

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.getUserHistory({
        userId: user.id,
        from: toUnixSeconds(fromMs),
        ...(toMs !== null ? {to: toUnixSeconds(toMs)} : {}),
        limit: 5000,
        offset: 0,
      })

      const items = res?.history ?? []
      setHistory(items)

      if (items.length) {
        const msList = items.map(x => normalizeCreatedAtToMs(x.createdAt)).sort((a, b) => a - b)
        const min = msList[0]
        const max = msList[msList.length - 1]
        setFromMs(min - 60 * 1000) // -1 min
        // setToMs(max + 60 * 1000)   // +1 min
        setAutoToMs(max + 60 * 1000)
      }
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('ui:historyFromMs', String(fromMs))
  }, [fromMs])

  useEffect(() => {
    localStorage.setItem('ui:historyToMs', String(toMs))
  }, [toMs])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tagIntervals = useMemo(
    () => buildTagIntervals(history.filter(h => h.type === 'tag'), fromMs, effectiveToMs),
    [history, fromMs, effectiveToMs],
  )
  const segmentIntervals = useMemo(
    () => buildSegmentIntervals(history, fromMs, effectiveToMs),
    [history, fromMs, effectiveToMs],
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
    }))
  }, [tagIntervals, tagNameToIndex])

  const tagsChartOptions = useMemo(() => {
    return {
      chart: {
        type: 'xrange',
        height: Math.max(240, 80 + tagCategories.length * 34),
        backgroundColor: 'transparent',
      },
      title: {text: null},
      xAxis: {
        type: 'datetime',
        min: fromMs,
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
          const start = fmtDateTime(this.point.x)
          const end = fmtDateTime(this.point.x2)
          return `<b>${this.point.name}</b><br/>${start} → ${end}`
        },
      },
      series: [
        {
          name: 'Tags',
          borderColor: 'rgba(0,0,0,0.25)',
          borderWidth: 1,
          data: tagSeriesData,
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
  }, [tagCategories, tagSeriesData, fromMs, toMs])

  const segmentSeriesData = useMemo(() => {
    return segmentIntervals.map(it => ({
      x: it.startMs,
      x2: it.endMs,
      y: 0,
      color: it.color || undefined,
      name: it.name,
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
        min: fromMs,
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
          const start = fmtDateTime(this.point.x)
          const end = fmtDateTime(this.point.x2)
          return `<b>${this.point.name}</b><br/>${start} → ${end}`
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
  }, [segmentSeriesData, fromMs, toMs])

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
          <button className="btn" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="grid2">
        <div className="field">
          <div className="label">From</div>
          <input
            className="input"
            type="datetime-local"
            value={new Date(fromMs).toISOString().slice(0, 16)}
            onChange={e => setFromMs(new Date(e.target.value).getTime())}
          />
        </div>

        <div className="field">
          <div className="label">To</div>
          <input
            className="input"
            type="datetime-local"
            value={toMs ? toLocalInputValue(toMs) : ''}
            onChange={e => setToMs(e.target.value ? new Date(e.target.value).getTime() : null)}
          />
        </div>
      </div>

      <div className="cardInner">
        <div className="cardInner__title">Segment timeline</div>
        <HighchartsReact highcharts={Highcharts} options={segmentChartOptions}/>
      </div>

      <div className="cardInner">
        <div className="cardInner__title">Tags timeline</div>
        <HighchartsReact highcharts={Highcharts} options={tagsChartOptions}/>
      </div>
    </div>
  )
}
