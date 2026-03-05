import React, {useEffect, useMemo, useRef, useState} from 'react'
import {DayPicker} from 'react-day-picker'

function fmt(ms) {
  if (ms == null) return '—'
  const d = new Date(ms)
  // 24h format without AM/PM
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function toDateOnly(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function msToTimeValue(ms) {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function timeValueToHM(v) {
  const [hh, mm] = String(v || '').split(':')
  const h = Number(hh)
  const m = Number(mm)
  return {
    h: Number.isFinite(h) ? h : 0,
    m: Number.isFinite(m) ? m : 0,
  }
}

function withTime(dateOnly, hh, mm) {
  return new Date(
    dateOnly.getFullYear(),
    dateOnly.getMonth(),
    dateOnly.getDate(),
    hh,
    mm,
    0,
    0,
  ).getTime()
}

export default function DateTimeRangePicker({
                                              fromMs,
                                              toMs,
                                              onChange,
                                              onDone,
                                              placeholder = 'Select range',
                                              months = 2,
                                            }) {
  const ref = useRef(null)
  const fromTimeRef = useRef(null)
  const toTimeRef = useRef(null)
  const [open, setOpen] = useState(false)

  const todayDateOnly = useMemo(() => toDateOnly(Date.now()), [])
  const prevMonthFirstDay = useMemo(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth() - 1, 1)
  }, [])

  const selected = useMemo(() => {
    const from = fromMs != null ? toDateOnly(fromMs) : undefined
    const to = from ? (toMs != null ? toDateOnly(toMs) : todayDateOnly) : undefined
    return {from, to}
  }, [fromMs, toMs, todayDateOnly])

  // close on outside click
  useEffect(() => {
    function onDoc(e) {
      if (!open) return
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }

    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label =
    fromMs == null && toMs == null
      ? placeholder
      : `${fmt(fromMs)} → ${toMs == null ? 'now' : fmt(toMs)}`

  const fromTime = fromMs != null ? msToTimeValue(fromMs) : '00:00'
  const toTime =
    toMs != null
      ? msToTimeValue(toMs)
      : msToTimeValue(Date.now())

  return (
    <div ref={ref} style={{position: 'relative'}}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen(o => !o)}
        style={{minWidth: 320, justifyContent: 'space-between', display: 'inline-flex'}}
        title="Pick date & time range"
      >
        <span>{label}</span>
        <span style={{color: '#fff'}}>🕒</span>
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 'calc(100% + 8px)',
            left: 0,
            padding: 12,
          }}
        >
          <DayPicker
            mode="range"
            numberOfMonths={months}
            pagedNavigation
            defaultMonth={prevMonthFirstDay}
            classNames={{
              months: 'rdp-months--inline',
            }}
            disabled={{after: todayDateOnly}}
            toDate={todayDateOnly}
            selected={selected}
            onSelect={range => {
              const fromD = range?.from ? toDateOnly(range.from.getTime()) : null
              const toD = range?.to ? toDateOnly(range.to.getTime()) : null

              if (!fromD) {
                onChange({fromMs: null, toMs: null})
                return
              }

              // keep existing times if already set, otherwise defaults
              const {h: fh, m: fm} = timeValueToHM(fromMs != null ? msToTimeValue(fromMs) : '00:00')
              const {h: th, m: tm} = timeValueToHM(toMs != null ? msToTimeValue(toMs) : msToTimeValue(Date.now()))

              const nextFromMs = withTime(fromD, fh, fm)

              // if user picked a "to" date, set toMs; otherwise keep current toMs (including null=now)
              const nextToMs =
                toD
                  ? withTime(toD, th, tm)
                  : toMs

              onChange({fromMs: nextFromMs, toMs: nextToMs})
            }}
          />

          <div className="grid2" style={{marginTop: 10}}>
            <div className="field">
              <div className="label">From time</div>
              <input
                ref={fromTimeRef}
                className="input"
                type="time"
                value={fromTime}
                onClick={() => fromTimeRef.current && fromTimeRef.current.showPicker && fromTimeRef.current.showPicker()}
                onFocus={() => fromTimeRef.current && fromTimeRef.current.showPicker && fromTimeRef.current.showPicker()}
                onChange={e => {
                  if (fromMs == null) return
                  const {h, m} = timeValueToHM(e.target.value)
                  const d = toDateOnly(fromMs)
                  onChange({fromMs: withTime(d, h, m), toMs})
                }}
              />
            </div>

            <div className="field">
              <div className="label">To time</div>
              <input
                ref={toTimeRef}
                className="input"
                type="time"
                value={toTime}
                disabled={toMs == null}
                onClick={() => toTimeRef.current && toTimeRef.current.showPicker && toTimeRef.current.showPicker()}
                onFocus={() => toTimeRef.current && toTimeRef.current.showPicker && toTimeRef.current.showPicker()}
                onChange={e => {
                  if (toMs == null) return
                  const {h, m} = timeValueToHM(e.target.value)
                  const d = toDateOnly(toMs)
                  onChange({fromMs, toMs: withTime(d, h, m)})
                }}
              />
              <div className="mutedSmall" style={{marginTop: 6}}>
                <label style={{display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={toMs == null}
                    onChange={e => {
                      if (e.target.checked) onChange({fromMs, toMs: null})
                      else {
                        // if enabling "to", default it to today with current time
                        if (fromMs == null) return
                        const now = new Date()
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                        onChange({fromMs, toMs: withTime(today, now.getHours(), now.getMinutes())})
                      }
                    }}
                  />
                  To = now
                </label>
              </div>
            </div>
          </div>

          <div className="row row--space" style={{marginTop: 10}}>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onChange({fromMs: null, toMs: null})}
            >
              Clear
            </button>

            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => {
                setOpen(false)
                if (typeof onDone === 'function') onDone()
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
