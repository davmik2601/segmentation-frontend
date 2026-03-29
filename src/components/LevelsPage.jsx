import React, {useEffect, useMemo, useState} from 'react'
import {toast} from 'react-toastify'
import {api} from '../lib/api.js'
import {uid} from '../lib/uid.js'
import {validateLevelsSetupPayload} from '../lib/validation.js'

function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

function normalizeLevel(level) {
  const fromXP = level?.fromXP == null ? null : Number(level.fromXP)
  const toXP = level?.toXP == null ? null : Number(level.toXP)

  return {
    _id: uid(),
    ...(level?.id ? {id: level.id} : {}),
    name: level?.name ?? '',
    description: level?.description ?? '',
    color: level?.color ?? '#e5e7eb',
    fromXP: fromXP == null ? '' : String(fromXP),
    toXP: toXP == null ? '' : String(toXP),
    baseSpan:
      fromXP != null && toXP != null && toXP >= fromXP
        ? (toXP - fromXP) + 1
        : 100,
  }
}

function getLevelSpan(level) {
  const fromXP = toIntOrNull(level?.fromXP)
  const toXP = toIntOrNull(level?.toXP)

  if (fromXP != null && toXP != null && toXP >= fromXP) {
    return (toXP - fromXP) + 1
  }

  return 100
}

function getLevelBaseSpan(level) {
  if (Number.isInteger(level?.baseSpan) && level.baseSpan > 0) {
    return level.baseSpan
  }

  return getLevelSpan(level)
}

function shiftLevel(level, diff) {
  const fromXP = toIntOrNull(level.fromXP)
  const toXP = toIntOrNull(level.toXP)

  return {
    ...level,
    fromXP: fromXP == null ? '' : String(fromXP + diff),
    toXP: toXP == null ? '' : String(toXP + diff),
  }
}

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') {
    return `rgba(255, 255, 255, ${alpha})`
  }

  let value = hex.replace('#', '').trim()

  if (value.length === 3) {
    value = value.split('').map(x => x + x).join('')
  }

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return `rgba(255, 255, 255, ${alpha})`
  }

  const int = parseInt(value, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function recalculateLevels(levels) {
  if (!levels.length) return levels

  const next = []
  let currentFrom = 0

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    const span = getLevelBaseSpan(level)

    const fromXP = currentFrom
    const toXP = currentFrom + span - 1

    next.push({
      ...level,
      fromXP: String(fromXP),
      toXP: String(toXP),
    })

    currentFrom = toXP + 1
  }

  return next
}

function BoolSwitch({value, onChange, leftLabel = 'Disabled', rightLabel = 'Enabled'}) {
  return (
    <div className="switch" role="group" aria-label="boolean switch">
      <button
        type="button"
        className={`switch__btn ${!value ? 'is-active' : ''}`}
        onClick={() => onChange(false)}
      >
        {leftLabel}
      </button>

      <button
        type="button"
        className={`switch__btn ${value ? 'is-active' : ''}`}
        onClick={() => onChange(true)}
      >
        {rightLabel}
      </button>
    </div>
  )
}

export default function LevelsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const [enabled, setEnabled] = useState(false)
  const [timeRangeDays, setTimeRangeDays] = useState('180')
  const [xpPerAmount, setXpPerAmount] = useState('1')
  const [levels, setLevels] = useState([])

  async function load() {
    setLoading(true)
    setErr(null)

    try {
      const data = await api.getLevels()
      const configs = data?.configs ?? {}
      const list = Array.isArray(data?.levels) ? data.levels : []

      setEnabled(Boolean(configs?.enabled))
      setTimeRangeDays(String(configs?.timeRangeDays ?? 180))
      setXpPerAmount(String(configs?.xpPerAmount ?? 1))
      setLevels(list.map(normalizeLevel))
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function updateLevel(levelId, patch) {
    setLevels(prev => {
      const index = prev.findIndex(x => x._id === levelId)

      if (index === -1) {
        return prev
      }

      const next = prev.map(x => ({...x}))
      next[index] = {
        ...next[index],
        ...patch,
      }

      const changedFromXP = Object.prototype.hasOwnProperty.call(patch, 'fromXP')
      const changedToXP = Object.prototype.hasOwnProperty.call(patch, 'toXP')

      // normal fields
      if (!changedFromXP && !changedToXP) {
        return next
      }

      const current = next[index]
      const currentFrom = toIntOrNull(current.fromXP)
      const currentTo = toIntOrNull(current.toXP)

      // for NEW levels only, when user changes xp range manually,
      // update their own baseSpan too, so later recalculations keep that new width
      if (!current.id && currentFrom != null && currentTo != null && currentTo >= currentFrom) {
        current.baseSpan = (currentTo - currentFrom) + 1
      }

      // when current fromXP changes -> previous toXP changes
      if (changedFromXP && index > 0) {
        const fromXP = toIntOrNull(next[index].fromXP)

        next[index - 1] = {
          ...next[index - 1],
          toXP: fromXP == null ? '' : String(fromXP - 1),
        }
      }

      // when current toXP changes -> next fromXP changes
      if (changedToXP && index < next.length - 1) {
        const toXP = toIntOrNull(next[index].toXP)

        next[index + 1] = {
          ...next[index + 1],
          fromXP: toXP == null ? '' : String(toXP + 1),
        }
      }

      return next
    })
  }

  function insertLevelAt(index) {
    setLevels(prev => {
      const list = [...prev]

      const newLevel = {
        _id: uid(),
        name: '',
        description: '',
        color: '#e5e7eb',
        fromXP: '',
        toXP: '',
        baseSpan: 100,
      }

      const next = [
        ...list.slice(0, index),
        newLevel,
        ...list.slice(index),
      ]

      return recalculateLevels(next)
    })
  }

  function removeLevel(levelId) {
    setLevels(prev => {
      const next = prev.filter(x => x._id !== levelId)
      return recalculateLevels(next)
    })
  }

  const previewPayload = useMemo(() => {
    return {
      enabled: Boolean(enabled),
      timeRangeDays: Number(timeRangeDays),
      xpPerAmount: Number(xpPerAmount),
      levels: levels.map(level => {
        const item = {
          ...(level.id ? {id: level.id} : {}),
          name: String(level.name ?? '').trim(),
          ...(String(level.description ?? '').trim()
            ? {description: String(level.description).trim()}
            : {}),
          ...(String(level.color ?? '').trim()
            ? {color: String(level.color).trim().toLowerCase()}
            : {}),
          ...(toIntOrNull(level.fromXP) != null
            ? {fromXP: toIntOrNull(level.fromXP)}
            : {}),
          ...(toIntOrNull(level.toXP) != null
            ? {toXP: toIntOrNull(level.toXP)}
            : {}),
        }

        return item
      }),
    }
  }, [enabled, timeRangeDays, xpPerAmount, levels])

  async function save() {
    const validation = validateLevelsSetupPayload(previewPayload)

    if (!validation.ok) {
      const msg = validation.errors[0] || 'Please fix validation errors'
      setErr(msg)
      toast.error(msg)
      return
    }

    setSaving(true)
    setErr(null)

    try {
      await api.setupLevels(previewPayload)
      await load()
      toast.success('Levels saved')
    } catch (e) {
      const msg = e?.message || String(e)
      setErr(msg)
      toast.error(`Failed to save levels: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <div className="row row--space">
        <div>
          <div className="sectionTitle">Levels</div>
          <div className="mutedSmall">Configure leveling and XP ranges</div>
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
          <div className="pill">{loading ? 'Loading…' : `${levels.length} levels`}</div>
        </div>

        <div className="levelsConfigGrid">
          <div className="field">
            <div className="label">enabled</div>
            <BoolSwitch value={enabled} onChange={setEnabled}/>
          </div>

          <div className="field">
            <div className="label">timeRangeDays</div>
            <input
              className="input"
              type="number"
              min="0"
              value={timeRangeDays}
              onChange={e => setTimeRangeDays(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="label">xpPerAmount</div>
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={xpPerAmount}
              onChange={e => setXpPerAmount(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <div className="card__title">Levels setup</div>
          <div className="hint">fromXP of next level is always previous toXP + 1</div>
        </div>

        <div className="levelsBuilder">
          <button
            type="button"
            className="btn btn--ghost levelsInsertBtn"
            onClick={() => insertLevelAt(0)}
          >
            + Add level here
          </button>

          {!levels.length && (
            <div className="empty">
              No levels yet. Create first level.
            </div>
          )}

          {levels.map((level, index) => (
            <React.Fragment key={level._id}>
              <div
                className="levelCard"
                style={{
                  background: hexToRgba(level.color || '#e5e7eb', 0.16),
                  borderColor: hexToRgba(level.color || '#e5e7eb', 0.34),
                  // background: `
                  //     linear-gradient(0deg, ${hexToRgba(level.color || '#e5e7eb', 0.28)}, transparent 60%),
                  //     linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 40%),
                  //     var(--card2)
                  // `,
                  // borderColor: hexToRgba(level.color || '#e5e7eb', 0.32),
                }}
              >
                <div className="levelCard__header">
                  <div className="row row--gap">
                    <div
                      className="dot"
                      style={{
                        background: level.color || '#e5e7eb',
                        height: 28,
                        width: 28,
                      }}
                    />

                    <div>
                      <div className="group__title">
                        Level {index + 1}
                        {level.id ? (
                          <span className="badge">#{level.id}</span>
                        ) : (
                          <span className="badge badge--new">NEW</span>
                        )}
                      </div>
                      <div className="hint">Create all levels, then save once</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => removeLevel(level._id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="levelsCardGrid">
                  <div className="field">
                    <div className="label">name *</div>
                    <input
                      className="input"
                      value={level.name}
                      onChange={e => updateLevel(level._id, {name: e.target.value})}
                      placeholder="e.g. Bronze"
                    />
                  </div>

                  <div className="field levelsColorField">
                    <div className="label">color</div>
                    <input
                      className="levelsColorPicker"
                      type="color"
                      value={level.color || '#e5e7eb'}
                      onChange={e => updateLevel(level._id, {color: e.target.value})}
                    />
                  </div>

                  <div className="field levelsXpField">
                    <div className="label">XP range</div>
                    <div className="levelsXpRow">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={level.fromXP}
                        onChange={e => updateLevel(level._id, {fromXP: e.target.value})}
                        placeholder="fromXP"
                      />

                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={level.toXP}
                        onChange={e => updateLevel(level._id, {toXP: e.target.value})}
                        placeholder="toXP"
                      />
                    </div>
                  </div>

                  <div className="field levelsDescriptionField">
                    <div className="label">description</div>
                    <textarea
                      className="input levelsTextarea"
                      value={level.description}
                      onChange={e => updateLevel(level._id, {description: e.target.value})}
                      placeholder="Optional description"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn--ghost levelsInsertBtn"
                onClick={() => insertLevelAt(index + 1)}
              >
                + Add level here
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
