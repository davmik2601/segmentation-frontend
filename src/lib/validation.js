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

  // - if event == net_result or net_profit_percentage => aggregation and metric must be null
  if (out.event === 'net_result' || out.event === 'net_profit_percentage') {
    out.aggregation = null
    out.metric = null
  }

  // 2) metric rules:
  // - metric is only allowed for casino/sport
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

  out.timeMode = ENUMS.tagTimeModes.includes(out.timeMode) ? out.timeMode : 'last_period'

  if (out.timeMode === 'last_period') {
    out.periodValue = Number(out.periodValue ?? 240)
    out.periodUnit = ENUMS.periodUnits.includes(out.periodUnit) ? out.periodUnit : 'day'
    out.fromDate = null
    out.toDate = null
  } else {
    out.periodValue = null
    out.periodUnit = null
    out.fromDate = out.fromDate == null ? null : Number(out.fromDate)
    out.toDate = out.toDate == null ? null : Number(out.toDate)
  }

  return out
}

export function validateTagPayload(payload) {
  const errors = []

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

      if (r.event === 'net_result' || r.event === 'net_profit_percentage') {
        if (r.aggregation != null) errors.push(`rule[${gi}][${ri}].aggregation must be null when event=${r.event}`)
      } else if ((r.event === 'casino' || r.event === 'sport') && r.metric === 'ggr') {
        if (r.aggregation != null) errors.push(`rule[${gi}][${ri}].aggregation must be null when metric=ggr`)
      } else {
        if (!ENUMS.aggregations.includes(r.aggregation)) errors.push(`rule[${gi}][${ri}].aggregation invalid`)
      }

      if (!ENUMS.operators.includes(r.operator)) errors.push(`rule[${gi}][${ri}].operator invalid`)

      if (!ENUMS.tagTimeModes.includes(r.timeMode)) {
        errors.push(`rule[${gi}][${ri}].timeMode invalid`)
      }

      if (!String(r.valueFrom ?? '').length) errors.push(`rule[${gi}][${ri}].valueFrom is required`)

      const between = r.operator === 'between' || r.operator === 'not_between'
      if (between && !String(r.valueTo ?? '').length) errors.push(`rule[${gi}][${ri}].valueTo is required for between/not_between`)

      if (r.timeMode === 'last_period') {
        if (!ENUMS.periodUnits.includes(r.periodUnit)) errors.push(`rule[${gi}][${ri}].periodUnit invalid`)
        if (!Number.isInteger(r.periodValue) || r.periodValue < 0) errors.push(`rule[${gi}][${ri}].periodValue must be int >= 0`)
      }

      if (r.timeMode === 'date_interval') {
        if (r.periodValue != null) errors.push(`rule[${gi}][${ri}].periodValue must be null when timeMode=date_interval`)
        if (r.periodUnit != null) errors.push(`rule[${gi}][${ri}].periodUnit must be null when timeMode=date_interval`)

        if (r.fromDate != null && !Number.isInteger(Number(r.fromDate))) {
          errors.push(`rule[${gi}][${ri}].fromDate must be unix seconds`)
        }

        if (r.toDate != null && !Number.isInteger(Number(r.toDate))) {
          errors.push(`rule[${gi}][${ri}].toDate must be unix seconds`)
        }

        if (r.fromDate == null && r.toDate == null) {
          errors.push(`rule[${gi}][${ri}].fromDate or toDate is required when timeMode=date_interval`)
        }
      }

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

      if (r.event === 'net_result' || r.event === 'net_profit_percentage') {
        if (r.metric != null) errors.push(`rule[${gi}][${ri}].metric must be null when event=${r.event}`)
      }

      if (r.event === 'login') {
        if (r.metric != null) errors.push(`rule[${gi}][${ri}].metric must be null when event=login`)
        if (r.aggregation !== 'count') errors.push(`rule[${gi}][${ri}].aggregation must be count when event=login`)
      }
    })
  })

  return {ok: errors.length === 0, errors}
}

export function validateLevelsSetupPayload(payload) {
  const errors = []

  if (!payload || typeof payload !== 'object') {
    errors.push('payload must be an object')
    return {ok: false, errors}
  }

  if (!Array.isArray(payload.levels)) {
    errors.push('levels must be an array')
    return {ok: errors.length === 0, errors}
  }

  if (payload.enabled && payload.levels.length === 0) {
    errors.push('At least one level is required when leveling is enabled.')
  }

  if (payload.levels.length > 0) {
    const first = payload.levels[0]

    if (first.fromXP == null) {
      first.fromXP = 0
    }
  }

  payload.levels.forEach((level, index) => {
    const fromXP = level.fromXP
    const toXP = level.toXP
    const isFirst = index === 0
    const isLast = index === payload.levels.length - 1
    const isMiddle = !isFirst && !isLast

    if (level.id != null) {
      if (!Number.isInteger(level.id) || level.id <= 0) {
        errors.push(`levels[${index}].id must be positive int`)
      }
    }

    if (!String(level.name ?? '').trim()) {
      errors.push(`levels[${index}].name is required`)
    }

    if (level.color != null && String(level.color).trim()) {
      const ok = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(String(level.color).trim())
      if (!ok) {
        errors.push(`levels[${index}].color must be a hex like #eeeeee`)
      }
    }

    if (fromXP != null && (!Number.isInteger(fromXP) || fromXP < 0)) {
      errors.push(`levels[${index}].fromXP must be int >= 0`)
    }

    if (toXP != null && (!Number.isInteger(toXP) || toXP < 0)) {
      errors.push(`levels[${index}].toXP must be int >= 0`)
    }

    if (fromXP != null && toXP != null && fromXP >= toXP) {
      errors.push(`levels[${index}].fromXP must be less than toXP`)
    }

    if (fromXP == null) {
      errors.push('fromXP is required for all levels except the first one (which is overwritten to 0 if missing).')
    }

    if (isLast) {
      if (toXP != null) {
        errors.push(`toXP must be not provided (or null) for the last level.`)
      }
    } else {
      if (fromXP == null || toXP == null) {
        errors.push('fromXP and toXP are required for the first and midle levels.')
      }
    }


    if (index > 0) {
      const prev = payload.levels[index - 1]

      if (prev.toXP != null && fromXP != null && prev.toXP + 1 !== fromXP) {
        errors.push(`levels[${index}].fromXP must match previous level toXP + 1`)
      }
    }
  })

  return {ok: errors.length === 0, errors}
}
