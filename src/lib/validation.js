import {ENUMS} from './enums.js'

export function normalizeRuleByBusinessRules(rule) {
  const out = {...rule}

  // your backend refine rules:
  // - if event == login => aggregation must be count, metric must be null
  if (out.event === 'login') {
    out.aggregation = 'count'
    out.metric = null
  }

  // - if event == net_result => aggregation and metric must be null
  if (out.event === 'net_result') {
    out.aggregation = null
    out.metric = null
  }

  // - if aggregation == count => metric must be null (or omitted)
  if (out.aggregation === 'count') {
    out.metric = null
  }

  // - if operator not between => valueTo must be null
  if (out.operator !== 'between' && out.operator !== 'not_between') {
    out.valueTo = null
  }

  // ensure types
  out.valueFrom = String(out.valueFrom ?? '')
  out.valueTo = out.valueTo == null ? null : String(out.valueTo)
  out.periodValue = Number(out.periodValue ?? 240)

  return out
}

export function validateTagPayload(payload) {
  const errors = []

  if (!payload || typeof payload !== 'object') errors.push('payload must be an object')
  if (!payload.name || !String(payload.name).trim()) errors.push('name is required')

  if (![0, 1].includes(Number(payload.active ?? 0))) errors.push('active must be 0 or 1')
  if (![0, 1].includes(Number(payload.persistent ?? 0))) errors.push('persistent must be 0 or 1')

  if (!Array.isArray(payload.groups) || !payload.groups.length) errors.push('at least 1 group is required')

  ;
  (payload.groups ?? []).forEach((g, gi) => {
    if (!ENUMS.connectors.includes(g.connector)) errors.push(`group[${gi}].connector must be "and" | "or"`)
    if (!Array.isArray(g.rules) || !g.rules.length) errors.push(`group[${gi}] must have at least 1 rule`)

    ;
    (g.rules ?? []).forEach((r, ri) => {
      if (!ENUMS.connectors.includes(r.connector)) errors.push(`rule[${gi}][${ri}].connector invalid`)
      if (!ENUMS.events.includes(r.event)) errors.push(`rule[${gi}][${ri}].event invalid`)

      if (r.event !== 'net_result') {
        if (!ENUMS.aggregations.includes(r.aggregation)) errors.push(`rule[${gi}][${ri}].aggregation invalid`)
      } else {
        if (r.aggregation != null) errors.push(`rule[${gi}][${ri}].aggregation must be null when event=net_result`)
      }

      if (!ENUMS.operators.includes(r.operator)) errors.push(`rule[${gi}][${ri}].operator invalid`)
      if (!ENUMS.periodUnits.includes(r.periodUnit)) errors.push(`rule[${gi}][${ri}].periodUnit invalid`)

      if (!String(r.valueFrom ?? '').length) errors.push(`rule[${gi}][${ri}].valueFrom is required`)

      const between = r.operator === 'between' || r.operator === 'not_between'
      if (between && !String(r.valueTo ?? '').length) errors.push(`rule[${gi}][${ri}].valueTo is required for between/not_between`)

      if (!Number.isInteger(r.periodValue) || r.periodValue < 0) errors.push(`rule[${gi}][${ri}].periodValue must be int >= 0`)

      // backend refine rules mirrored:
      if (r.event !== 'net_result') {
        if (r.aggregation !== 'count' && !r.metric) errors.push(`rule[${gi}][${ri}].metric is required when aggregation != count`)
      } else {
        if (r.metric != null) errors.push(`rule[${gi}][${ri}].metric must be null when event=net_result`)
      }

      if (r.event === 'login') {
        if (r.metric) errors.push(`rule[${gi}][${ri}].metric must be empty when event=login`)
        if (r.aggregation !== 'count') errors.push(`rule[${gi}][${ri}].aggregation must be count when event=login`)
      }
    })
  })

  return {ok: errors.length === 0, errors}
}
