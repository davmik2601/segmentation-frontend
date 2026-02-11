import React, {useEffect, useMemo, useRef, useState} from 'react'
import {DayPicker} from 'react-day-picker'

function startOfDayMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

function endOfDayMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

function fmt(ms) {
  if (ms == null) return '—'
  return new Date(ms).toLocaleDateString()
}

export default function DateRangePicker({
                                          fromMs,
                                          toMs,
                                          onChange,
                                          onDone,
                                          placeholder = 'Select range',
                                          months = 2,
                                        }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  const selected = useMemo(() => {
    return {
      from: fromMs != null ? new Date(fromMs) : undefined,
      to: toMs != null ? new Date(toMs) : undefined,
    }
  }, [fromMs, toMs])

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

  return (
    <div ref={ref} style={{position: 'relative'}}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen(o => !o)}
        style={{minWidth: 260, justifyContent: 'space-between', display: 'inline-flex'}}
        title="Pick date range"
      >
        <span>{label}</span>
        <span className="mutedSmall">📅</span>
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
            classNames={{
              months: 'rdp-months--inline',
            }}
            selected={selected}
            onSelect={range => {
              const f = range?.from ? startOfDayMs(range.from) : null
              const t = range?.to ? endOfDayMs(range.to) : null
              onChange({fromMs: f, toMs: t})
            }}
          />

          <div className="row row--space" style={{marginTop: 8}}>
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
