import React, {useEffect, useMemo, useState} from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import DateRangePicker from './DateRangePicker.jsx'
import {api} from '../lib/api.js'

Highcharts.setOptions({
  time: {useUTC: false},
})

function toUnixSeconds(ms) {
  return Math.floor(ms / 1000)
}

function fmtRange(fromSec, toSec) {
  const fromMs = Number(fromSec) * 1000
  const toMs = Number(toSec) * 1000
  const a = Number.isFinite(fromMs) ? new Date(fromMs).toLocaleString() : ''
  const b = Number.isFinite(toMs) ? new Date(toMs).toLocaleString() : ''
  return `${a} → ${b}`
}

const BUCKET_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16]

export default function SegmentStatisticsCharts({refreshKey}) {
  const nowMs = Date.now()

  // default: last 7 days
  const defaultFromMs = nowMs - 7 * 24 * 3600 * 1000

  // applied (used for request + charts)
  const [appliedFromMs, setAppliedFromMs] = useState(defaultFromMs)
  const [appliedToMs, setAppliedToMs] = useState(null)
  const [appliedBuckets, setAppliedBuckets] = useState(3)

  // draft (UI only)
  const [draftFromMs, setDraftFromMs] = useState(defaultFromMs)
  const [draftToMs, setDraftToMs] = useState(null)
  const [draftBuckets, setDraftBuckets] = useState(3)

  // metric selector (no refetch needed)
  const [metric, setMetric] = useState('usersCount') // usersCount | userTimeSeconds | avgUsers

  const [chartType, setChartType] = useState('pie') // pie | bar (future: add more here)

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [data, setData] = useState(null)
  const [openBucketIndex, setOpenBucketIndex] = useState(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.getSegmentStatistics({
        buckets: appliedBuckets,
        ...(appliedFromMs !== null ? {from: toUnixSeconds(appliedFromMs)} : {}),
        ...(appliedToMs !== null ? {to: toUnixSeconds(appliedToMs)} : {}),
      })
      setData(res || null)
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // initial load
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // reload on global Refresh button
  useEffect(() => {
    if (refreshKey === undefined) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  function apply() {
    setAppliedFromMs(draftFromMs)
    setAppliedToMs(draftToMs)
    setAppliedBuckets(draftBuckets)

    // load using the next applied values (avoid waiting state update)
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const res = await api.getSegmentStatistics({
          buckets: draftBuckets,
          ...(draftFromMs !== null ? {from: toUnixSeconds(draftFromMs)} : {}),
          ...(draftToMs !== null ? {to: toUnixSeconds(draftToMs)} : {}),
        })
        setData(res || null)
      } catch (e) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }

  const buckets = Array.isArray(data?.buckets) ? data.buckets : []

  const metricLabel = useMemo(() => {
    if (metric === 'userTimeSeconds') return 'Time spent (seconds)'
    if (metric === 'avgUsers') return 'Avg users'
    return 'Users count'
  }, [metric])

  function getValue(s) {
    if (metric === 'userTimeSeconds') return Number(s.userTimeSeconds ?? 0)
    if (metric === 'avgUsers') return Number(s.avgUsers ?? 0)
    return Number(s.usersCount ?? 0)
  }

  function buildChart({type, height, buckets, metricLabel}) {
    if (type === 'bar') {
      // categories = buckets, series = segments (stacked)
      const categories = buckets.map((b, i) => `#${i + 1}`)
      const bucketSubtitles = buckets.map(b => fmtRange(b.from, b.to))

      // collect all segments across all buckets
      /** @type {Map<string, {name: string, color?: string}>} */
      const segMap = new Map()

      for (const b of buckets) {
        const stats = Array.isArray(b.statistics) ? b.statistics : []
        for (const s of stats) {
          const id = s?.segment?.id
          const key = id != null ? String(id) : (s?.segment?.slug || s?.segment?.name || '')
          if (!key) continue
          if (!segMap.has(key)) {
            segMap.set(key, {
              name: s?.segment?.name || s?.segment?.slug || `Segment ${key}`,
              color: s?.segment?.color || undefined,
            })
          }
        }
      }

      // series per segment: value per bucket
      const series = Array.from(segMap.entries()).map(([key, meta]) => {
        const data = buckets.map(b => {
          const stats = Array.isArray(b.statistics) ? b.statistics : []
          const s = stats.find(x => {
            const id = x?.segment?.id
            const k = id != null ? String(id) : (x?.segment?.slug || x?.segment?.name || '')
            return k === key
          })
          return s ? getValue(s) : 0
        })

        return {
          type: 'column',
          name: meta.name,
          color: meta.color,
          data,
        }
      })

      return {
        chart: {type: 'column', height, backgroundColor: '#f2f2f2'},
        title: {text: `Buckets — ${metricLabel}`},
        subtitle: {text: 'Each column is a bucket (stacked by segments)'},
        xAxis: {
          categories,
          labels: {
            formatter: function () {
              return this.value
            },
          },
          gridLineWidth: 1,
          gridLineColor: '#d6d6d6',
        },
        yAxis: {
          min: 0,
          title: {text: metricLabel},
          stackLabels: {enabled: false},
          gridLineWidth: 1,
          gridLineColor: '#d6d6d6',
        },
        tooltip: {
          /** For shared tooltip (all segments in the bucket) */
          shared: true,
          formatter: function () {
            const i = this.points?.[0]?.point?.index ?? 0
            const range = bucketSubtitles[i] || ''
            let s = `<b>Bucket #${i + 1}</b><br/>${range}<br/><br/>`
            for (const p of (this.points || [])) {
              s += `<span style="color: ${p.series.color}">${p.series.name}:</span> <b>${p.y}</b> (${p.percentage.toFixed(2)})<br/>`
            }
            return s
          },

          /** For individual tooltip (single segment in the bucket) */
          // formatter: function () {
          //   const i = this.point?.index ?? 0
          //   const range = bucketSubtitles[i] || ''
          //   const pct = (this.point.percentage ?? 0).toFixed(2)
          //   return `
          //     <b>Bucket #${i + 1}</b><br/>${range}<br/><br/>
          //     <span style="color: ${this.series.color}">${this.series.name}:</span>
          //     <b>${this.y}</b> (${pct}%)
          //   `
          // },
        },
        plotOptions: {
          column: {
            stacking: 'normal',
            borderWidth: 0,
          },
        },
        series: series.length ? series : [{type: 'column', name: 'No data', data: buckets.map(() => 1)}],
        credits: {enabled: false},
      }
    }

    // default pie (single bucket only). For multi-bucket pies, you already render multiple charts.
    return null
  }

  return (
    <div className="stack">
      {err && <div className="alert alert--error">{err}</div>}

      <div className="row row--space" style={{alignItems: 'flex-end', gap: 12, flexWrap: 'wrap'}}>
        <div className="stack stack--tight" style={{minWidth: 320}}>
          <div className="label">Interval</div>
          <div className="row row--gap" style={{alignItems: 'center', flexWrap: 'wrap'}}>
            <DateRangePicker
              fromMs={draftFromMs}
              toMs={draftToMs}
              onChange={({fromMs, toMs}) => {
                setDraftFromMs(fromMs)
                setDraftToMs(toMs)
              }}
              onDone={() => {
                // auto-apply when user confirms range
                apply()
              }}
              placeholder="Select date range"
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
            Applied: {appliedFromMs ? new Date(appliedFromMs).toLocaleString() : '—'} → {appliedToMs ? new Date(appliedToMs).toLocaleString() : 'now'}
          </div>
        </div>

        <div className="stack stack--tight">
          <div className="label">Buckets</div>
          <div className="switch" role="tablist" aria-label="Buckets">
            {BUCKET_OPTIONS.map(n => (
              <button
                key={n}
                type="button"
                className={`switch__btn ${draftBuckets === n ? 'is-active' : ''}`}
                onClick={() => {
                  setDraftBuckets(n)

                  // request immediately with new buckets + current draft range
                  setAppliedBuckets(n)
                  setAppliedFromMs(draftFromMs)
                  setAppliedToMs(draftToMs)

                  ;(async () => {
                    setLoading(true)
                    setErr(null)
                    try {
                      const res = await api.getSegmentStatistics({
                        buckets: n,
                        ...(draftFromMs !== null ? {from: toUnixSeconds(draftFromMs)} : {}),
                        ...(draftToMs !== null ? {to: toUnixSeconds(draftToMs)} : {}),
                      })
                      setData(res || null)
                    } catch (e) {
                      setErr(e?.message || String(e))
                    } finally {
                      setLoading(false)
                    }
                  })()
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="stack stack--tight">
          <div className="label">Metric</div>
          <div className="switch" role="tablist" aria-label="Metric">
            <button
              type="button"
              className={`switch__btn ${metric === 'usersCount' ? 'is-active' : ''}`}
              onClick={() => setMetric('usersCount')}
            >
              Users
            </button>
            <button
              type="button"
              className={`switch__btn ${metric === 'userTimeSeconds' ? 'is-active' : ''}`}
              onClick={() => setMetric('userTimeSeconds')}
            >
              Time spent
            </button>
            <button
              type="button"
              className={`switch__btn ${metric === 'avgUsers' ? 'is-active' : ''}`}
              onClick={() => setMetric('avgUsers')}
            >
              Avg
            </button>
          </div>
        </div>

        <div className="row row--gap" style={{alignItems: 'center'}}>
          <button className="btn btn--primary" onClick={apply} disabled={loading}>
            Apply
          </button>
          <div className="pill">{loading ? 'Loading…' : `${buckets.length} bucket(s)`}</div>
        </div>

        <div className="stack stack--tight">
          <div className="label">Chart</div>
          <div className="switch" role="tablist" aria-label="Chart type">
            <button
              type="button"
              className={`switch__btn ${chartType === 'pie' ? 'is-active' : ''}`}
              onClick={() => setChartType('pie')}
            >
              Pie
            </button>
            <button
              type="button"
              className={`switch__btn ${chartType === 'bar' ? 'is-active' : ''}`}
              onClick={() => setChartType('bar')}
            >
              Bar
            </button>
          </div>
        </div>
      </div>

      {chartType === 'bar' ? (
        <div
          className="card"
          style={{padding: 12, cursor: 'pointer'}}
          role="button"
          tabIndex={0}
          onClick={() => setOpenBucketIndex(-1)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') setOpenBucketIndex(-1)
          }}
          title="Click to expand"
        >
          <HighchartsReact
            highcharts={Highcharts}
            options={buildChart({
              type: 'bar',
              height: 420,
              buckets,
              metricLabel,
            })}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {buckets.map((b, idx) => {
            const stats = Array.isArray(b.statistics) ? b.statistics : []

            const points = stats
              .map(s => ({
                name: s?.segment?.name || s?.segment?.slug || `Segment #${s?.segment?.id ?? ''}`,
                y: getValue(s),
                color: s?.segment?.color || undefined,
              }))
              .filter(p => Number(p.y) > 0)

            const options = {
              chart: {type: 'pie', height: 320, backgroundColor: 'transparent'},
              title: {text: `Bucket #${idx + 1} — ${metricLabel}`},
              subtitle: {text: fmtRange(b.from, b.to)},
              tooltip: {
                formatter: function () {
                  return `<b>${this.point.y}</b> (${this.point.percentage.toFixed(1)}%)`
                },
              },
              plotOptions: {
                pie: {
                  allowPointSelect: true,
                  cursor: 'pointer',
                  dataLabels: {
                    enabled: true,
                    // borderWidth: 0,
                    color: '#ffffff',
                    backgroundColor: 'none',
                    formatter: function () {
                      return `${this.point.name}: ${this.point.y} (${this.point.percentage.toFixed(1)}%)`
                    },
                  },
                },
              },
              series: [{name: metricLabel, data: points.length ? points : [{name: 'No data', y: 1}]}],
              credits: {enabled: false},
            }

            return (
              <div
                key={idx}
                className="card"
                style={{padding: 12, cursor: 'pointer'}}
                role="button"
                tabIndex={0}
                onClick={() => setOpenBucketIndex(idx)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') setOpenBucketIndex(idx)
                }}
                title="Click to expand"
              >
                <HighchartsReact highcharts={Highcharts} options={options}/>
              </div>
            )
          })}
        </div>
      )}

      {!loading && !buckets.length && (
        <div className="empty">No statistics yet.</div>
      )}

      {openBucketIndex !== null && (
        <div
          className="modalOverlay"
          onClick={() => setOpenBucketIndex(null)}
          role="presentation"
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal__header">
              <div className="modal__title">
                {chartType === 'bar' || openBucketIndex === -1
                  ? 'Buckets (expanded)'
                  : `Bucket #${openBucketIndex + 1}`}
              </div>
              <button
                style={{color: 'black'}}
                className="btn btn--ghost btn--small"
                onClick={() => setOpenBucketIndex(null)}
              >
                Close
              </button>
            </div>

            <div className="modal__body">
              {chartType === 'bar' || openBucketIndex === -1 ? (
                <HighchartsReact
                  highcharts={Highcharts}
                  options={buildChart({
                    type: 'bar',
                    height: 700,
                    buckets,
                    metricLabel,
                  })}
                />
              ) : (
                (() => {
                  const b = buckets[openBucketIndex]
                  const stats = Array.isArray(b?.statistics) ? b.statistics : []

                  const points = stats
                    .map(s => ({
                      name: s?.segment?.name || s?.segment?.slug || `Segment #${s?.segment?.id ?? ''}`,
                      y: getValue(s),
                      color: s?.segment?.color || undefined,
                    }))
                    .filter(p => Number(p.y) > 0)

                  const bigOptions = {
                    chart: {type: 'pie', height: 620, backgroundColor: 'transparent'},
                    title: {text: `Bucket #${openBucketIndex + 1} — ${metricLabel}`},
                    subtitle: {text: fmtRange(b.from, b.to)},
                    tooltip: {
                      formatter: function () {
                        return `<b>${this.point.y}</b> (${this.point.percentage.toFixed(1)}%)`
                      },
                    },
                    plotOptions: {
                      pie: {
                        allowPointSelect: true,
                        cursor: 'pointer',
                        dataLabels: {
                          enabled: true,
                          formatter: function () {
                            return `${this.point.name}: ${this.point.y} (${this.point.percentage.toFixed(2)}%)`
                          },
                        },
                      },
                    },
                    series: [{name: metricLabel, data: points.length ? points : [{name: 'No data', y: 1}]}],
                    credits: {enabled: false},
                  }

                  return <HighchartsReact highcharts={Highcharts} options={bigOptions}/>
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
