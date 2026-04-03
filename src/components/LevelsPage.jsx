import React, {useEffect, useMemo, useState} from 'react'
import {toast} from 'react-toastify'
import {api} from '../lib/api.js'
import {uid} from '../lib/uid.js'
import {validateLevelsSetupPayload} from '../lib/validation.js'

const LEVEL_SECTIONS = ['sport', 'casino', 'virtual-sport', 'live-casino']

const SECTION_LABELS = {
  sport: 'Sport',
  casino: 'Casino',
  'virtual-sport': 'Virtual Sport',
  'live-casino': 'Live Casino',
}

function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

function toNumberOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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

function buildEmptyGameRule(parentXpPerAmount = '1') {
  return {
    _id: uid(),
    finalGameId: '',
    enabled: true,
    xpPerAmount: String(parentXpPerAmount ?? '1'),
  }
}

function normalizeGameRule(gameRule, parentXpPerAmount = '1') {
  return {
    _id: uid(),
    ...(gameRule?.id ? {id: gameRule.id} : {}),
    finalGameId: gameRule?.finalGameId == null ? '' : String(gameRule.finalGameId),
    enabled: Boolean(gameRule?.enabled),
    xpPerAmount: String(
      gameRule?.xpPerAmount != null ? gameRule.xpPerAmount : parentXpPerAmount,
    ),
  }
}

function buildEmptyProviderRule(parentXpPerAmount = '1') {
  return {
    _id: uid(),
    finalProviderId: '',
    enabled: true,
    gamesDefaultEnabled: true,
    xpPerAmount: String(parentXpPerAmount ?? '1'),
    gameRules: [],
  }
}

function normalizeProviderRule(providerRule, parentXpPerAmount = '1') {
  const providerXpPerAmount =
    providerRule?.xpPerAmount != null
      ? providerRule.xpPerAmount
      : parentXpPerAmount

  return {
    _id: uid(),
    ...(providerRule?.id ? {id: providerRule.id} : {}),
    finalProviderId:
      providerRule?.finalProviderId == null ? '' : String(providerRule.finalProviderId),
    enabled: Boolean(providerRule?.enabled),
    gamesDefaultEnabled: Boolean(providerRule?.gamesDefaultEnabled),
    xpPerAmount: String(providerXpPerAmount),
    gameRules: Array.isArray(providerRule?.gameRules)
      ? providerRule.gameRules.map(gameRule =>
        normalizeGameRule(gameRule, providerXpPerAmount),
      )
      : [],
  }
}

function buildEmptySectionRule(parentXpPerAmount = '1') {
  return {
    _id: uid(),
    enabled: true,
    providersDefaultEnabled: true,
    xpPerAmount: String(parentXpPerAmount ?? '1'),
    providerRules: [],
  }
}

function normalizeSectionRule(sectionKey, sectionRule, parentXpPerAmount = '1') {
  const sectionXpPerAmount =
    sectionRule?.xpPerAmount != null
      ? sectionRule.xpPerAmount
      : parentXpPerAmount

  return {
    _id: uid(),
    ...(sectionRule?.id ? {id: sectionRule.id} : {}),
    enabled: Boolean(sectionRule?.enabled),
    providersDefaultEnabled: Boolean(sectionRule?.providersDefaultEnabled),
    xpPerAmount: String(sectionXpPerAmount),
    providerRules:
      sectionKey === 'sport'
        ? []
        : Array.isArray(sectionRule?.providerRules)
          ? sectionRule.providerRules.map(providerRule =>
            normalizeProviderRule(providerRule, sectionXpPerAmount),
          )
          : [],
  }
}

function normalizeSectionRules(sectionRules, parentXpPerAmount = '1') {
  return LEVEL_SECTIONS.reduce((acc, sectionKey) => {
    acc[sectionKey] = normalizeSectionRule(
      sectionKey,
      sectionRules?.[sectionKey],
      parentXpPerAmount,
    )
    return acc
  }, {})
}

function validateConfigsAndRulesPayload(payload) {
  const errors = []

  if (toIntOrNull(payload?.configs?.timeRangeDays) == null || Number(payload.configs.timeRangeDays) < 0) {
    errors.push('Global config: timeRangeDays must be a non-negative integer')
  }

  if (toNumberOrNull(payload?.configs?.xpPerAmount) == null || Number(payload.configs.xpPerAmount) < 0) {
    errors.push('Global config: xpPerAmount must be a non-negative number')
  }

  for (const sectionKey of LEVEL_SECTIONS) {
    const sectionRule = payload?.sectionRules?.[sectionKey]

    if (!sectionRule) {
      errors.push(`Rules: ${SECTION_LABELS[sectionKey]} section is missing`)
      continue
    }

    if (toNumberOrNull(sectionRule?.xpPerAmount) == null || Number(sectionRule.xpPerAmount) < 0) {
      errors.push(`${SECTION_LABELS[sectionKey]}: xpPerAmount must be a non-negative number`)
    }

    if (sectionKey === 'sport') {
      continue
    }

    for (let i = 0; i < sectionRule.providerRules.length; i++) {
      const providerRule = sectionRule.providerRules[i]

      if (toIntOrNull(providerRule?.finalProviderId) == null || Number(providerRule.finalProviderId) <= 0) {
        errors.push(
          `${SECTION_LABELS[sectionKey]} provider #${i + 1}: finalProviderId must be a positive integer`,
        )
        return {ok: false, errors}
      }

      if (toNumberOrNull(providerRule?.xpPerAmount) == null || Number(providerRule.xpPerAmount) < 0) {
        errors.push(
          `${SECTION_LABELS[sectionKey]} provider #${i + 1}: xpPerAmount must be a non-negative number`,
        )
        return {ok: false, errors}
      }

      for (let j = 0; j < providerRule.gameRules.length; j++) {
        const gameRule = providerRule.gameRules[j]

        if (toIntOrNull(gameRule?.finalGameId) == null || Number(gameRule.finalGameId) <= 0) {
          errors.push(
            `${SECTION_LABELS[sectionKey]} provider #${i + 1} game #${j + 1}: finalGameId must be a positive integer`,
          )
          return {ok: false, errors}
        }

        if (toNumberOrNull(gameRule?.xpPerAmount) == null || Number(gameRule.xpPerAmount) < 0) {
          errors.push(
            `${SECTION_LABELS[sectionKey]} provider #${i + 1} game #${j + 1}: xpPerAmount must be a non-negative number`,
          )
          return {ok: false, errors}
        }
      }
    }
  }

  return {ok: errors.length === 0, errors}
}

function SegmentedBoolSwitch({
                               value,
                               onChange,
                               leftLabel = 'Disabled',
                               rightLabel = 'Enabled',
                             }) {
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

function ToggleSwitch({
                        checked,
                        onChange,
                        variant = 'primary',
                        size = 'md',
                        disabled = false,
                      }) {
  return (
    <label
      className={[
        'toggleSwitch',
        `toggleSwitch--${variant}`,
        `toggleSwitch--${size}`,
        disabled ? 'is-disabled' : '',
      ].join(' ').trim()}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="toggleSwitch__track">
        <span className="toggleSwitch__thumb"/>
      </span>
    </label>
  )
}

export default function LevelsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const [activeTab, setActiveTab] = useState('configs-and-rules')

  const [enabled, setEnabled] = useState(false)
  const [timeRangeDays, setTimeRangeDays] = useState('180')
  const [xpPerAmount, setXpPerAmount] = useState('1')
  const [sectionRules, setSectionRules] = useState(() => normalizeSectionRules(null, '1'))
  const [openSections, setOpenSections] = useState(() =>
    LEVEL_SECTIONS.reduce((acc, key) => {
      acc[key] = key === 'sport'
      return acc
    }, {}),
  )
  const [levels, setLevels] = useState([])

  async function loadLevels() {
    const data = await api.getLevels()
    const list = Array.isArray(data?.levels) ? data.levels : []
    setLevels(list.map(normalizeLevel))
  }

  async function loadConfigsAndRules() {
    const data = await api.getLevelsConfigsAndRules()
    const configs = data?.configs ?? {}
    const globalXpPerAmount = String(configs?.xpPerAmount ?? 1)

    setEnabled(Boolean(configs?.enabled))
    setTimeRangeDays(String(configs?.timeRangeDays ?? 180))
    setXpPerAmount(globalXpPerAmount)
    setSectionRules(normalizeSectionRules(data?.sectionRules, globalXpPerAmount))
  }

  async function load() {
    setLoading(true)
    setErr(null)

    try {
      await Promise.all([
        loadLevels(),
        loadConfigsAndRules(),
      ])
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

  function updateSectionRule(sectionKey, patch) {
    setSectionRules(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        ...patch,
      },
    }))
  }

  function toggleSectionOpen(sectionKey) {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }))
  }

  function openSection(sectionKey) {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: true,
    }))
  }

  function addProviderRule(sectionKey) {
    openSection(sectionKey)

    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule || sectionKey === 'sport') {
        return prev
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: [
            ...currentSectionRule.providerRules,
            buildEmptyProviderRule(currentSectionRule.xpPerAmount),
          ],
        },
      }
    })
  }

  function updateProviderRule(sectionKey, providerRuleId, patch) {
    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) {
        return prev
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: currentSectionRule.providerRules.map(providerRule =>
            providerRule._id === providerRuleId
              ? {
                ...providerRule,
                ...patch,
              }
              : providerRule,
          ),
        },
      }
    })
  }

  function removeProviderRule(sectionKey, providerRuleId) {
    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) {
        return prev
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: currentSectionRule.providerRules.filter(
            providerRule => providerRule._id !== providerRuleId,
          ),
        },
      }
    })
  }

  function addGameRule(sectionKey, providerRuleId) {
    openSection(sectionKey)

    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) {
        return prev
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: currentSectionRule.providerRules.map(providerRule =>
            providerRule._id === providerRuleId
              ? {
                ...providerRule,
                gameRules: [
                  ...providerRule.gameRules,
                  buildEmptyGameRule(providerRule.xpPerAmount),
                ],
              }
              : providerRule,
          ),
        },
      }
    })
  }

  function updateGameRule(sectionKey, providerRuleId, gameRuleId, patch) {
    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) {
        return prev
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: currentSectionRule.providerRules.map(providerRule =>
            providerRule._id === providerRuleId
              ? {
                ...providerRule,
                gameRules: providerRule.gameRules.map(gameRule =>
                  gameRule._id === gameRuleId
                    ? {
                      ...gameRule,
                      ...patch,
                    }
                    : gameRule,
                ),
              }
              : providerRule,
          ),
        },
      }
    })
  }

  function removeGameRule(sectionKey, providerRuleId, gameRuleId) {
    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) {
        return prev
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: currentSectionRule.providerRules.map(providerRule =>
            providerRule._id === providerRuleId
              ? {
                ...providerRule,
                gameRules: providerRule.gameRules.filter(
                  gameRule => gameRule._id !== gameRuleId,
                ),
              }
              : providerRule,
          ),
        },
      }
    })
  }

  const levelsPreviewPayload = useMemo(() => {
    return {
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
  }, [levels])

  const configsAndRulesPreviewPayload = useMemo(() => {
    return {
      configs: {
        enabled: enabled ? 1 : 0,
        timeRangeDays: Number(timeRangeDays),
        xpPerAmount: Number(xpPerAmount),
      },
      sectionRules: LEVEL_SECTIONS.reduce((acc, sectionKey) => {
        const sectionRule = sectionRules[sectionKey] ?? buildEmptySectionRule(xpPerAmount)

        acc[sectionKey] = {
          enabled: sectionRule.enabled ? 1 : 0,
          providersDefaultEnabled: sectionRule.providersDefaultEnabled ? 1 : 0,
          xpPerAmount: Number(sectionRule.xpPerAmount),
          providerRules:
            sectionKey === 'sport'
              ? []
              : sectionRule.providerRules.map(providerRule => ({
                finalProviderId: Number(providerRule.finalProviderId),
                enabled: providerRule.enabled ? 1 : 0,
                gamesDefaultEnabled: providerRule.gamesDefaultEnabled ? 1 : 0,
                xpPerAmount: Number(providerRule.xpPerAmount),
                gameRules: providerRule.gameRules.map(gameRule => ({
                  finalGameId: Number(gameRule.finalGameId),
                  enabled: gameRule.enabled ? 1 : 0,
                  xpPerAmount: Number(gameRule.xpPerAmount),
                })),
              })),
        }

        return acc
      }, {}),
    }
  }, [enabled, timeRangeDays, xpPerAmount, sectionRules])

  async function save() {
    if (activeTab === 'levels') {
      const validation = validateLevelsSetupPayload({
        ...configsAndRulesPreviewPayload.configs,
        levels: levelsPreviewPayload.levels,
      })

      if (!validation.ok) {
        const msg = validation.errors[0] || 'Please fix validation errors'
        setErr(msg)
        toast.error(msg)
        return
      }
    }

    if (activeTab === 'configs-and-rules') {
      const validation = validateConfigsAndRulesPayload(configsAndRulesPreviewPayload)

      if (!validation.ok) {
        const msg = validation.errors[0] || 'Please fix validation errors'
        setErr(msg)
        toast.error(msg)
        return
      }
    }

    setSaving(true)
    setErr(null)

    try {
      if (activeTab === 'levels') {
        await api.setupLevels(levelsPreviewPayload)
        await loadLevels()
        toast.success('Levels saved')
      } else {
        await api.setupLevelsConfigsAndRules(configsAndRulesPreviewPayload)
        await loadConfigsAndRules()
        toast.success('Configs and rules saved')
      }
    } catch (e) {
      const msg = e?.message || String(e)
      setErr(msg)
      toast.error(
        activeTab === 'levels'
          ? `Failed to save levels: ${msg}`
          : `Failed to save configs and rules: ${msg}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <div className="row row--space">
        <div>
          <div className="sectionTitle">Levels</div>
          <div className="mutedSmall">Configure leveling configs, rules, and levels</div>
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
        <div
          className="switch"
          role="tablist"
          aria-label="levels page tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'configs-and-rules'}
            className={`switch__btn ${activeTab === 'configs-and-rules' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('configs-and-rules')}
          >
            Configs and Rules
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'levels'}
            className={`switch__btn ${activeTab === 'levels' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('levels')}
          >
            Levels
          </button>
        </div>
      </div>

      {activeTab === 'configs-and-rules' && (
        <>
          <div className="card">
            <div className="card__header">
              <div className="card__title">Global config</div>
              <div className="pill">Configs</div>
            </div>

            <div className="levelsConfigGrid">
              <div className="field">
                <div className="label">enabled</div>
                <SegmentedBoolSwitch value={enabled} onChange={setEnabled}/>
              </div>

              <div className="field">
                <div className="label">timeRangeDays</div>
                <input
                  className="input input--light"
                  type="number"
                  min="0"
                  value={timeRangeDays}
                  onChange={e => setTimeRangeDays(e.target.value)}
                />
              </div>

              <div className="field">
                <div className="label">xpPerAmount</div>
                <input
                  className="input input--light"
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
              <div className="card__title">Rules</div>
              <div className="pill">4 sections</div>
            </div>

            <div className="rulesSections">
              {LEVEL_SECTIONS.map(sectionKey => {
                const sectionRule = sectionRules[sectionKey] ?? buildEmptySectionRule(xpPerAmount)
                const isOpen = Boolean(openSections[sectionKey])

                return (
                  <div
                    key={sectionKey}
                    className={`ruleSectionCard ${isOpen ? 'is-open' : 'is-closed'}`}
                  >
                    <div
                      className={`ruleSectionAccordionBar ${isOpen ? 'is-open' : ''}`}
                      onClick={e => {
                        if (e.target.closest('.ruleSectionAccordionSafe')) {
                          return
                        }
                        toggleSectionOpen(sectionKey)
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${SECTION_LABELS[sectionKey]} section`}
                      onKeyDown={e => {
                        if (e.target !== e.currentTarget) {
                          return
                        }

                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleSectionOpen(sectionKey)
                        }
                      }}
                    >
                      <div className="ruleSectionAccordionBar__section">
                        <div className="group__title">
                          {SECTION_LABELS[sectionKey]}
                          {sectionRule.id ? (
                            <span className="badge">#{sectionRule.id}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="field ruleSectionAccordionBar__switchField ruleSectionAccordionSafe">
                        <div className="label">enabled</div>
                        <ToggleSwitch
                          checked={sectionRule.enabled}
                          onChange={value => updateSectionRule(sectionKey, {enabled: value})}
                          variant="primary"
                        />
                      </div>

                      <div className="field ruleSectionAccordionSafe">
                        <div className="label">xpPerAmount</div>
                        <input
                          className="input input--light"
                          type="number"
                          min="0"
                          step="any"
                          value={sectionRule.xpPerAmount}
                          onChange={e => updateSectionRule(sectionKey, {xpPerAmount: e.target.value})}
                        />
                      </div>

                      <div className="field ruleSectionAccordionBar__switchField ruleSectionAccordionSafe">
                        <div className="label">providersDefaultEnabled</div>
                        <ToggleSwitch
                          checked={sectionRule.providersDefaultEnabled}
                          onChange={value => updateSectionRule(sectionKey, {providersDefaultEnabled: value})}
                          variant="secondary"
                          size="sm"
                        />
                      </div>

                      {sectionKey !== 'sport' ? (
                        <div className="field ruleSectionAccordionBar__addField ruleSectionAccordionSafe">
                          <div className="label">&nbsp;</div>
                          <button
                            type="button"
                            className="btn btn--ghost levelsInsertBtn"
                            onClick={() => addProviderRule(sectionKey)}
                          >
                            + Add provider rule
                          </button>
                        </div>
                      ) : (
                        <div className="field ruleSectionAccordionBar__addField">
                          <div className="label">&nbsp;</div>
                          <div className="hint ruleSectionSportHint">
                            No provider rules for sport
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        className={`ruleSectionAccordionBtn ruleSectionAccordionSafe ${isOpen ? 'is-open' : ''}`}
                        onClick={() => toggleSectionOpen(sectionKey)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${SECTION_LABELS[sectionKey]} section`}
                      >
                        <span className="ruleSectionAccordionBtn__icon">⌄</span>
                      </button>
                    </div>

                    <div className={`ruleSectionAccordionBody ${isOpen ? 'is-open' : ''}`}>
                      <div className="ruleSectionAccordionBody__inner">
                        {sectionKey === 'sport' ? (
                          <div className="empty">
                            Sport section does not use provider rules. providerRules will always be sent as an empty array.
                          </div>
                        ) : (
                          <div className="rulesProvidersWrap">
                            {!sectionRule.providerRules.length && (
                              <div className="empty">
                                No provider rules yet.
                              </div>
                            )}

                            <div className="rulesProvidersList">
                              {sectionRule.providerRules.map((providerRule, providerIndex) => (
                                <div key={providerRule._id} className="providerRuleCard">
                                  <div className="providerRuleCard__row">
                                    <div className="providerRuleCard__title">
                                      <div className="group__title">
                                        Provider rule {providerIndex + 1}
                                        {providerRule.id ? (
                                          <span className="badge">#{providerRule.id}</span>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="field providerRuleCard__thumbField">
                                      <div className="label">provider</div>
                                      <img
                                        className="ruleEntityThumb"
                                        src="https://placehold.co/40x40?text=P"
                                        alt="Provider"
                                      />
                                    </div>

                                    <div className="field">
                                      <div className="label">enabled</div>
                                      <ToggleSwitch
                                        checked={providerRule.enabled}
                                        onChange={value => updateProviderRule(sectionKey, providerRule._id, {
                                          enabled: value,
                                        })}
                                        variant="primary"
                                      />
                                    </div>

                                    <div className="field">
                                      <div className="label">xpPerAmount</div>
                                      <input
                                        className="input input--light"
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={providerRule.xpPerAmount}
                                        onChange={e => updateProviderRule(sectionKey, providerRule._id, {
                                          xpPerAmount: e.target.value,
                                        })}
                                      />
                                    </div>

                                    <div className="field">
                                      <div className="label">gamesDefaultEnabled</div>
                                      <ToggleSwitch
                                        checked={providerRule.gamesDefaultEnabled}
                                        onChange={value => updateProviderRule(sectionKey, providerRule._id, {
                                          gamesDefaultEnabled: value,
                                        })}
                                        variant="secondary"
                                        size="sm"
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      className="btn btn--danger btn--small providerRuleCard__removeBtn"
                                      onClick={() => removeProviderRule(sectionKey, providerRule._id)}
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  <div className="rulesGamesWrap">
                                    <div className="row row--space rulesProvidersTop">
                                      <div className="sectionTitle--small">Game rules</div>

                                      <button
                                        type="button"
                                        className="btn btn--ghost levelsInsertBtn"
                                        onClick={() => addGameRule(sectionKey, providerRule._id)}
                                      >
                                        + Add game rule
                                      </button>
                                    </div>

                                    {!providerRule.gameRules.length && (
                                      <div className="empty">
                                        No game rules yet.
                                      </div>
                                    )}

                                    <div className="rulesGamesList">
                                      {providerRule.gameRules.map((gameRule, gameIndex) => (
                                        <div key={gameRule._id} className="gameRuleCard">
                                          <div className="gameRuleCard__row">
                                            <div className="gameRuleCard__title">
                                              <div className="group__title">
                                                Game rule {gameIndex + 1}
                                                {gameRule.id ? (
                                                  <span className="badge">#{gameRule.id}</span>
                                                ) : null}
                                              </div>
                                            </div>

                                            <div className="field gameRuleCard__thumbField">
                                              <div className="label">game</div>
                                              <img
                                                className="ruleEntityThumb"
                                                src="https://placehold.co/40x40?text=G"
                                                alt="Game"
                                              />
                                            </div>

                                            <div className="field">
                                              <div className="label">enabled</div>
                                              <ToggleSwitch
                                                checked={gameRule.enabled}
                                                onChange={value => updateGameRule(sectionKey, providerRule._id, gameRule._id, {
                                                  enabled: value,
                                                })}
                                                variant="primary"
                                              />
                                            </div>

                                            <div className="field">
                                              <div className="label">xpPerAmount</div>
                                              <input
                                                className="input input--light"
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={gameRule.xpPerAmount}
                                                onChange={e => updateGameRule(sectionKey, providerRule._id, gameRule._id, {
                                                  xpPerAmount: e.target.value,
                                                })}
                                              />
                                            </div>

                                            <button
                                              type="button"
                                              className="btn btn--danger btn--small gameRuleCard__removeBtn"
                                              onClick={() => removeGameRule(sectionKey, providerRule._id, gameRule._id)}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {activeTab === 'levels' && (
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
                          {level.name?.trim() ? ` (${level.name.trim()})` : ''}
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
      )}
    </div>
  )
}
