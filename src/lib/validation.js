import {ENUMS} from './enums.js'

export function normalizeRuleByBusinessRules(rule) {
  const out = {...rule}

  const isCasino = out.event === 'casino'
  const isSport = out.event === 'sport'
  const metricAllowed = isCasino || isSport

  // 1) event specific hard rules (mirror backend)
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

  // 2) metric rules:
  // - metric is only allowed for casino/sport (and only when aggregation != count)
  if (!metricAllowed) {
    out.metric = null
  } else {
    // keep only valid metrics if present
    if (!ENUMS.metrics.includes(out.metric)) {
      out.metric = ENUMS.metrics[0] || 'bet'
    }
  }

  // ggr does not support aggregation
  if (out.metric === 'ggr') {
    out.aggregation = null
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

  console.log(payload);

  if (!payload || typeof payload !== 'object') errors.push('payload must be an object')
  if (!payload.name || !String(payload.name).trim()) errors.push('name is required')

  if (![0, 1].includes(Number(payload.active ?? 0))) errors.push('active must be 0 or 1')
  if (![0, 1].includes(Number(payload.persistent ?? 0))) errors.push('persistent must be 0 or 1')

  if (payload.color != null) {
    const c = String(payload.color).trim()
    const ok = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(c)
    if (!ok) errors.push('color must be a hex like #eeeeee')
  }

  if (!Array.isArray(payload.groups) || !payload.groups.length) errors.push('at least 1 group is required')

  ;
  (payload.groups ?? []).forEach((g, gi) => {
    if (!ENUMS.connectors.includes(g.connector)) errors.push(`group[${gi}].connector must be "and" | "or"`)
    if (!Array.isArray(g.rules) || !g.rules.length) errors.push(`group[${gi}] must have at least 1 rule`)

    ;
    (g.rules ?? []).forEach((r, ri) => {
      if (!ENUMS.connectors.includes(r.connector)) errors.push(`rule[${gi}][${ri}].connector invalid`)
      if (!ENUMS.events.includes(r.event)) errors.push(`rule[${gi}][${ri}].event invalid`)

      if (r.event === 'net_result') {
        if (r.aggregation != null) errors.push(`rule[${gi}][${ri}].aggregation must be null when event=net_result`)
      } else if ((r.event === 'casino' || r.event === 'sport') && r.metric === 'ggr') {
        if (r.aggregation != null) errors.push(`rule[${gi}][${ri}].aggregation must be null when metric=ggr`)
      } else {
        if (!ENUMS.aggregations.includes(r.aggregation)) errors.push(`rule[${gi}][${ri}].aggregation invalid`)
      }

      if (!ENUMS.operators.includes(r.operator)) errors.push(`rule[${gi}][${ri}].operator invalid`)
      if (!ENUMS.periodUnits.includes(r.periodUnit)) errors.push(`rule[${gi}][${ri}].periodUnit invalid`)

      if (!String(r.valueFrom ?? '').length) errors.push(`rule[${gi}][${ri}].valueFrom is required`)

      const between = r.operator === 'between' || r.operator === 'not_between'
      if (between && !String(r.valueTo ?? '').length) errors.push(`rule[${gi}][${ri}].valueTo is required for between/not_between`)

      if (!Number.isInteger(r.periodValue) || r.periodValue < 0) errors.push(`rule[${gi}][${ri}].periodValue must be int >= 0`)

      // metric rules:
      const metricAllowed = r.event === 'casino' || r.event === 'sport'

      if (!metricAllowed) {
        // for all non casino/sport events metric must be null (including deposit/withdrawal/login/net_result)
        if (r.metric != null) errors.push(`rule[${gi}][${ri}].metric must be null unless event is casino/sport`)
      } else {
        // casino/sport:
        if (r.metric != null && !ENUMS.metrics.includes(r.metric)) {
          errors.push(`rule[${gi}][${ri}].metric invalid`)
        }

        // (optional) if you want to require metric always for casino/sport:
        if (!r.metric) {
          errors.push(`rule[${gi}][${ri}].metric is required for casino/sport`)
        }

        if (r.metric === 'ggr' && r.aggregation != null) {
          errors.push(`rule[${gi}][${ri}].aggregation must be null when metric=ggr`)
        }
      }

      if (r.event === 'net_result') {
        if (r.metric != null) errors.push(`rule[${gi}][${ri}].metric must be null when event=net_result`)
      }

      if (r.event === 'login') {
        if (r.metric != null) errors.push(`rule[${gi}][${ri}].metric must be null when event=login`)
        if (r.aggregation !== 'count') errors.push(`rule[${gi}][${ri}].aggregation must be count when event=login`)
      }
    })
  })

  return {ok: errors.length === 0, errors}
}
