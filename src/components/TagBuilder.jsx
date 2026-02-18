import React, {useEffect, useMemo, useState} from 'react'
import {uid} from '../lib/uid.js'
import {ENUMS} from '../lib/enums.js'
import {normalizeRuleByBusinessRules, validateTagPayload} from '../lib/validation.js'

function deepClone(x) {
  return JSON.parse(JSON.stringify(x))
}

function Switch({value, onChange, disabled}) {
  return (
    <div className={`switch ${disabled ? 'switch--disabled' : ''}`} role="group" aria-label="connector switch">
      <button
        type="button"
        className={`switch__btn ${value === 'and' ? 'is-active' : ''}`}
        onClick={() => !disabled && onChange('and')}
        disabled={disabled}
      >
        AND
      </button>
      <button
        type="button"
        className={`switch__btn ${value === 'or' ? 'is-active' : ''}`}
        onClick={() => !disabled && onChange('or')}
        disabled={disabled}
      >
        OR
      </button>
    </div>
  )
}

export default function TagBuilder({mode, initialState, onCreate, onUpdate}) {
  const [state, setState] = useState(() => deepClone(initialState))
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState([])

  // reset when switching tag to edit
  useEffect(() => {
    setState(deepClone(initialState))
    setErrors([])
  }, [initialState])

  const isEdit = mode === 'edit'

  function setName(name) {
    setState(s => ({...s, name}))
  }

  function setActive(active) {
    setState(s => ({...s, active}))
  }

  function setPersistent(persistent) {
    setState(s => ({...s, persistent}))
  }

  function setColor(color) {
    setState(s => ({...s, color}))
  }

  function addGroup() {
    setState(s => {
      const groups = [...(s.groups ?? [])]
      const gi = groups.length
      groups.push({
        _id: uid(),
        connector: 'and',
        sort: gi + 1,
        rules: [
          {
            _id: uid(),
            connector: 'and',
            event: 'deposit',
            aggregation: 'some',
            metric: 'amount',
            operator: 'gte',
            valueFrom: '',
            valueTo: null,
            periodValue: 240,
            periodUnit: 'day',
            sort: 1,
          },
        ],
      })
      return {...s, groups}
    })
  }

  function removeGroup(groupId) {
    setState(s => {
      const groups = (s.groups ?? []).filter(g => g._id !== groupId)
      // keep at least 1 group
      return {...s, groups: groups.length ? groups : s.groups}
    })
  }

  function updateGroup(groupId, patch) {
    setState(s => ({
      ...s,
      groups: (s.groups ?? []).map(g => (g._id === groupId ? {...g, ...patch} : g)),
    }))
  }

  function addRule(groupId) {
    setState(s => {
      const groups = (s.groups ?? []).map(g => {
        if (g._id !== groupId) return g
        const rules = [...(g.rules ?? [])]
        const ri = rules.length
        rules.push({
          _id: uid(),
          connector: 'or',
          event: 'deposit',
          aggregation: 'some',
          metric: 'amount',
          operator: 'gte',
          valueFrom: '',
          valueTo: null,
          periodValue: 240,
          periodUnit: 'day',
          sort: ri + 1,
        })
        return {...g, rules}
      })
      return {...s, groups}
    })
  }

  function removeRule(groupId, ruleId) {
    setState(s => {
      const groups = (s.groups ?? []).map(g => {
        if (g._id !== groupId) return g
        const rules = (g.rules ?? []).filter(r => r._id !== ruleId)
        // keep at least 1 rule in group
        return {...g, rules: rules.length ? rules : g.rules}
      })
      return {...s, groups}
    })
  }

  function updateRule(groupId, ruleId, patch) {
    setState(s => {
      const groups = (s.groups ?? []).map(g => {
        if (g._id !== groupId) return g
        const rules = (g.rules ?? []).map(r => (r._id === ruleId ? {...r, ...patch} : r))
        return {...g, rules}
      })
      return {...s, groups}
    })
  }

  const previewPayload = useMemo(() => {
    // build payload exactly for backend (no _id)
    const payload = {
      name: state.name ?? '',
      color: (state.color && String(state.color).trim())
        ? String(state.color).trim().toLowerCase()
        : null,
      active: Number(state.active ?? 0) ? 1 : 0,
      persistent: Number(state.persistent ?? 0) ? 1 : 0,
      groups: (state.groups ?? []).map((g, gi) => ({
        connector: gi === 0 ? 'and' : (g.connector || 'and'),
        sort: gi + 1,
        rules: (g.rules ?? []).map((r, ri) => {
          const normalized = normalizeRuleByBusinessRules({
            connector: gi === 0 && ri === 0 ? 'and' : (r.connector || 'and'),
            event: r.event,
            aggregation: r.aggregation,
            metric: r.metric ?? null,
            operator: r.operator,
            valueFrom: r.valueFrom ?? '',
            valueTo: r.valueTo ?? null,
            periodValue: r.periodValue === '' || r.periodValue == null ? 240 : Number(r.periodValue),
            periodUnit: r.periodUnit,
            sort: ri + 1,
          })
          return normalized
        }),
      })),
    }

    return payload
  }, [state])

  async function submit() {
    const v = validateTagPayload(previewPayload)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }

    setSubmitting(true)
    setErrors([])
    try {
      if (isEdit) {
        await onUpdate(state.id, previewPayload)
      } else {
        await onCreate(previewPayload)
        // reset form after create
        setState(deepClone(initialState))
      }
    } catch (e) {
      setErrors([e?.message || String(e)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack">
      {errors.length > 0 && (
        <div className="alert alert--error">
          <div className="alert__title">Validation / request error</div>
          <ul className="alert__list">
            {errors.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      )}

      <div className="grid2 grid2--tagHeader">
        <div className="field">
          <div className="label">Tag name</div>
          <input
            className="input"
            value={state.name ?? ''}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Potential Asshole 6014"
          />
        </div>

        <div className="row row--gap" style={{alignItems: 'center'}}>
          <input
            type="color"
            value={state.color || '#e5e7eb'}
            onChange={e => setColor(e.target.value)}
            style={{height: 36, width: 48, padding: 0, border: 'none', background: 'transparent'}}
          />
        </div>

        <div className="field">
          <div className="label">Persistent</div>

          <label className="row row--gap" style={{alignItems: 'center'}}>
            <input
              type="checkbox"
              className="checkboxToggle"
              checked={Number(state.persistent ?? 0) === 1}
              onChange={e => setPersistent(e.target.checked ? 1 : 0)}
            />
            <span className="mutedSmall">Persistent</span>
          </label>
        </div>

        <div className="field">
          <div className="label">Active</div>
          <div className="row row--gap">
            <button
              type="button"
              className={`btn ${Number(state.active ?? 0) === 1 ? '' : 'btn--ghost'}`}
              onClick={() => setActive(1)}
            >
              On
            </button>
            <button
              type="button"
              className={`btn ${Number(state.active ?? 0) === 0 ? '' : 'btn--ghost'}`}
              onClick={() => setActive(0)}
            >
              Off
            </button>
          </div>
        </div>

      </div>

      <div className="row row--space">
        <div className="sectionTitle">Groups</div>
        <button type="button" className="btn" onClick={addGroup}>
          + Add group
        </button>
      </div>

      <div className="stack">
        {(state.groups ?? []).map((g, gi) => {
          const isFirstGroup = gi === 0
          return (
            <div key={g._id} className="group">
              <div className="group__head">
                <div className="group__title">
                  Group {gi + 1}
                  {!isFirstGroup && <span className="badge">connector</span>}
                </div>

                <div className="group__actions">
                  {!isFirstGroup ? (
                    <Switch
                      value={g.connector || 'and'}
                      onChange={val => updateGroup(g._id, {connector: val})}
                    />
                  ) : (
                    <div className="hint">First group connector is always AND</div>
                  )}

                  {!isFirstGroup && (
                    <button type="button" className="btn btn--danger btn--small" onClick={() => removeGroup(g._id)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="row row--space">
                <div className="sectionTitle sectionTitle--small">Rules</div>
                <button type="button" className="btn btn--small" onClick={() => addRule(g._id)}>
                  + Add rule
                </button>
              </div>

              <div className="rules">
                {(g.rules ?? []).map((r, ri) => {
                  const isFirstRule = isFirstGroup && ri === 0
                  const event = r.event
                  const aggregation = r.aggregation
                  const operator = r.operator

                  // UI behavior similar to your backend refine rules
                  const isLogin = event === 'login'
                  const isNetResult = event === 'net_result'
                  const metricDisabled = isLogin || isNetResult || aggregation === 'count'
                  const aggregationDisabled = isLogin || isNetResult
                  const forcedAggregation = isLogin ? 'count' : aggregation

                  const aggregationUiValue = isNetResult ? '' : forcedAggregation
                  const aggregationUiDisabled = isLogin || isNetResult

                  const betweenNeedsTo = operator === 'between' || operator === 'not_between'
                  const valueToDisabled = !betweenNeedsTo

                  return (
                    <div key={r._id} className="rule">
                      <div className="rule__head">
                        <div className="rule__title">
                          Rule {ri + 1}
                          {!isFirstRule && <span className="badge">connector</span>}
                        </div>

                        <div className="rule__actions">
                          {!isFirstRule ? (
                            <Switch
                              value={r.connector || 'and'}
                              onChange={val => updateRule(g._id, r._id, {connector: val})}
                            />
                          ) : (
                            <div className="hint">First rule connector is always AND</div>
                          )}

                          {!(g.rules?.length === 1) && (
                            <button
                              type="button"
                              className="btn btn--danger btn--small"
                              onClick={() => removeRule(g._id, r._id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="gridRule">
                        <div className="field">
                          <div className="label">Event</div>
                          <select
                            className="select"
                            value={event}
                            onChange={e => {
                              const nextEvent = e.target.value
                              // if login => force aggregation=count, metric=null
                              if (nextEvent === 'login') {
                                updateRule(g._id, r._id, {event: nextEvent, aggregation: 'count', metric: null})
                              } else {
                                // if leaving login, restore defaults if missing
                                updateRule(g._id, r._id, {
                                  event: nextEvent,
                                  aggregation: forcedAggregation === 'count' ? 'some' : forcedAggregation,
                                  metric: 'amount',
                                })
                              }
                            }}
                          >
                            {ENUMS.events.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>

                        <div className="field">
                          <div className="label">Aggregation</div>
                          <select
                            className="select"
                            value={aggregationUiValue}
                            disabled={aggregationUiDisabled}
                            onChange={e => {
                              const nextAgg = e.target.value
                              // if count => metric=null
                              if (nextAgg === 'count') {
                                updateRule(g._id, r._id, {aggregation: nextAgg, metric: null})
                              } else {
                                updateRule(g._id, r._id, {aggregation: nextAgg, metric: r.metric ?? 'amount'})
                              }
                            }}
                          >
                            {isNetResult && (
                              <option value="" disabled>
                                not allowed
                              </option>
                            )}

                            {ENUMS.aggregations.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>

                        <div className="field">
                          <div className="label">Metric</div>
                          <select
                            className="select"
                            value={metricDisabled ? '' : (r.metric ?? 'amount')}
                            disabled={metricDisabled}
                            onChange={e => updateRule(g._id, r._id, {metric: e.target.value || null})}
                          >
                            <option value="" disabled>
                              {metricDisabled ? 'not allowed' : 'select'}
                            </option>
                            {ENUMS.metrics.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>

                        <div className="field">
                          <div className="label">Operator</div>
                          <select
                            className="select"
                            value={operator}
                            onChange={e => {
                              const nextOp = e.target.value
                              // if not between => clear valueTo
                              if (nextOp !== 'between' && nextOp !== 'not_between') {
                                updateRule(g._id, r._id, {operator: nextOp, valueTo: null})
                              } else {
                                updateRule(g._id, r._id, {operator: nextOp})
                              }
                            }}
                          >
                            {ENUMS.operators.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>

                        <div className="field">
                          <div className="label">Value from</div>
                          <input
                            className="input"
                            value={r.valueFrom ?? ''}
                            onChange={e => updateRule(g._id, r._id, {valueFrom: e.target.value})}
                            placeholder="string number (e.g. 13000)"
                          />
                        </div>

                        <div className="field">
                          <div className="label">Value to</div>
                          <input
                            className="input"
                            value={r.valueTo ?? ''}
                            disabled={valueToDisabled}
                            onChange={e => updateRule(g._id, r._id, {valueTo: e.target.value || null})}
                            placeholder={betweenNeedsTo ? 'required for between' : 'n/a'}
                          />
                        </div>

                        <div className="field">
                          <div className="label">Period</div>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            value={r.periodValue ?? ''}
                            onChange={e => {
                              const v = e.target.value
                              if (v === '' || /^\d+$/.test(v)) updateRule(g._id, r._id, {periodValue: v})
                            }}/>
                        </div>

                        <div className="field">
                          <div className="label">Period unit</div>
                          <select
                            className="select"
                            value={r.periodUnit}
                            onChange={e => updateRule(g._id, r._id, {periodUnit: e.target.value})}
                          >
                            {ENUMS.periodUnits.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="row row--space">
        <button type="button" className="btn btn--primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : (isEdit ? 'Update' : 'Create')}
        </button>
      </div>

      <details className="details">
        <summary>Payload preview (what will be sent)</summary>
        <pre className="code">{JSON.stringify(previewPayload, null, 2)}</pre>
      </details>
    </div>
  )
}
