import React, {useEffect, useMemo, useState} from 'react'
import {toast} from 'react-toastify'
import {api} from '../lib/api.js'
import {uid} from '../lib/uid.js'
import {validateLevelsSetupPayload} from '../lib/validation.js'

const LEVEL_SECTIONS = ['sport', 'casino', 'virtual-sport', 'live-casino']

const SECTION_PROVIDER_API_IDS = {
  casino: 1,
  'live-casino': 2,
  'virtual-sport': 3,
}

const SECTION_LABELS = {
  sport: 'Sport',
  casino: 'Casino',
  'virtual-sport': 'Virtual Sport',
  'live-casino': 'Live Casino',
}

function getSectionProviderApiId(sectionKey) {
  return SECTION_PROVIDER_API_IDS[sectionKey] ?? null
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''))
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

  const [activeTab, setActiveTab] = useState('levels')
  const [configSectionKey, setConfigSectionKey] = useState(null)

  const [sectionCatalogs, setSectionCatalogs] = useState({})
  const [sectionCatalogsLoading, setSectionCatalogsLoading] = useState({})
  const [sectionCatalogsLoaded, setSectionCatalogsLoaded] = useState({})
  const [selectedProviderIdsBySection, setSelectedProviderIdsBySection] = useState({})

  const [enabled, setEnabled] = useState(false)
  const [timeRangeDays, setTimeRangeDays] = useState('180')
  const [xpPerAmount, setXpPerAmount] = useState('1')
  const [sectionRules, setSectionRules] = useState(() => normalizeSectionRules(null, '1'))

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

  async function loadSectionProviders(sectionKey) {
    if (sectionKey === 'sport') return

    const sectionId = getSectionProviderApiId(sectionKey)
    if (!sectionId) return

    setSectionCatalogsLoading(prev => ({...prev, [sectionKey]: true}))

    try {
      const data = await api.getFinalProvidersBySection({
        sectionId,
        limit: 500,
      })

      const providers = Array.isArray(data?.data) ? data.data.slice().sort(sortByName) : []

      setSectionCatalogs(prev => {
        const prevSection = prev[sectionKey] ?? {}
        return {
          ...prev,
          [sectionKey]: {
            ...prevSection,
            providers,
            gamesByProviderId: prevSection.gamesByProviderId ?? {},
          },
        }
      })

      setSectionCatalogsLoaded(prev => ({...prev, [sectionKey]: true}))

      setSelectedProviderIdsBySection(prev => {
        if (prev[sectionKey]) return prev
        const firstProviderId = providers[0]?.finalProviderId
        return firstProviderId
          ? {...prev, [sectionKey]: String(firstProviderId)}
          : prev
      })
    } finally {
      setSectionCatalogsLoading(prev => ({...prev, [sectionKey]: false}))
    }
  }

  async function loadProviderGames(sectionKey, finalProviderId) {
    if (!sectionKey || !finalProviderId) return

    const providerIdStr = String(finalProviderId)

    const alreadyLoaded =
      sectionCatalogs?.[sectionKey]?.gamesByProviderId?.[providerIdStr]

    if (alreadyLoaded) {
      return
    }

    setSectionCatalogsLoading(prev => ({
      ...prev,
      [sectionKey]: true,
    }))

    try {
      const data = await api.getFinalGamesByProvider({
        finalProviderId,
        offset: 0,
        limit: 10000,
      })

      const games = Array.isArray(data?.data) ? data.data.slice().sort(sortByName) : []

      setSectionCatalogs(prev => {
        const prevSection = prev[sectionKey] ?? {}
        return {
          ...prev,
          [sectionKey]: {
            ...prevSection,
            providers: prevSection.providers ?? [],
            gamesByProviderId: {
              ...(prevSection.gamesByProviderId ?? {}),
              [providerIdStr]: games,
            },
          },
        }
      })
    } finally {
      setSectionCatalogsLoading(prev => ({
        ...prev,
        [sectionKey]: false,
      }))
    }
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

  useEffect(() => {
    if (!configSectionKey || configSectionKey === 'sport') return

    const selectedProviderId = selectedProviderIdsBySection[configSectionKey]
    if (!selectedProviderId) return

    loadProviderGames(configSectionKey, selectedProviderId).catch(e => {
      const msg = e?.message || String(e)
      setErr(msg)
      toast.error(`Failed to load provider games: ${msg}`)
    })
  }, [configSectionKey, selectedProviderIdsBySection, sectionCatalogs])

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

  function upsertProviderRuleByFinalProviderId(sectionKey, finalProviderId, patch = {}) {
    const providerIdStr = String(finalProviderId)

    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) return prev

      const existing = currentSectionRule.providerRules.find(
        item => String(item.finalProviderId) === providerIdStr,
      )

      let nextProviderRules

      if (existing) {
        nextProviderRules = currentSectionRule.providerRules.map(item =>
          String(item.finalProviderId) === providerIdStr
            ? {...item, ...patch}
            : item,
        )
      } else {
        nextProviderRules = [
          ...currentSectionRule.providerRules,
          normalizeProviderRule({
            finalProviderId: providerIdStr,
            enabled: currentSectionRule.providersDefaultEnabled,
            gamesDefaultEnabled: true,
            xpPerAmount: currentSectionRule.xpPerAmount,
            gameRules: [],
            ...patch,
          }, currentSectionRule.xpPerAmount),
        ]
      }

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: nextProviderRules,
        },
      }
    })
  }

  function upsertGameRuleByFinalIds(sectionKey, finalProviderId, finalGameId, patch = {}) {
    const providerIdStr = String(finalProviderId)
    const gameIdStr = String(finalGameId)

    setSectionRules(prev => {
      const currentSectionRule = prev[sectionKey]
      if (!currentSectionRule) return prev

      const providerRule = currentSectionRule.providerRules.find(
        item => String(item.finalProviderId) === providerIdStr,
      )

      const baseProviderRule = providerRule
        ? providerRule
        : normalizeProviderRule({
          finalProviderId: providerIdStr,
          enabled: currentSectionRule.providersDefaultEnabled,
          gamesDefaultEnabled: true,
          xpPerAmount: currentSectionRule.xpPerAmount,
          gameRules: [],
        }, currentSectionRule.xpPerAmount)

      const existingGameRule = baseProviderRule.gameRules.find(
        item => String(item.finalGameId) === gameIdStr,
      )

      const nextGameRules = existingGameRule
        ? baseProviderRule.gameRules.map(item =>
          String(item.finalGameId) === gameIdStr
            ? {...item, ...patch}
            : item,
        )
        : [
          ...baseProviderRule.gameRules,
          normalizeGameRule({
            finalGameId: gameIdStr,
            enabled: baseProviderRule.gamesDefaultEnabled,
            xpPerAmount: baseProviderRule.xpPerAmount,
            ...patch,
          }, baseProviderRule.xpPerAmount),
        ]

      const nextProviderRules = providerRule
        ? currentSectionRule.providerRules.map(item =>
          String(item.finalProviderId) === providerIdStr
            ? {...item, gameRules: nextGameRules}
            : item,
        )
        : [
          ...currentSectionRule.providerRules,
          {...baseProviderRule, gameRules: nextGameRules},
        ]

      return {
        ...prev,
        [sectionKey]: {
          ...currentSectionRule,
          providerRules: nextProviderRules,
        },
      }
    })
  }

  async function openSectionConfig(sectionKey) {
    setConfigSectionKey(sectionKey)

    if (sectionKey === 'sport') {
      return
    }

    if (!sectionCatalogsLoaded[sectionKey]) {
      try {
        await loadSectionProviders(sectionKey)
      } catch (e) {
        const msg = e?.message || String(e)
        setErr(msg)
        toast.error(`Failed to load ${SECTION_LABELS[sectionKey]} providers: ${msg}`)
      }
    }
  }

  function closeSectionConfig() {
    setConfigSectionKey(null)
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

  function getProviderRuleByFinalProviderId(sectionKey, finalProviderId) {
    const sectionRule = sectionRules[sectionKey]
    if (!sectionRule) return null

    return sectionRule.providerRules.find(
      item => String(item.finalProviderId) === String(finalProviderId),
    ) ?? null
  }

  function getGameRuleByFinalIds(sectionKey, finalProviderId, finalGameId) {
    const providerRule = getProviderRuleByFinalProviderId(sectionKey, finalProviderId)
    if (!providerRule) return null

    return providerRule.gameRules.find(
      item => String(item.finalGameId) === String(finalGameId),
    ) ?? null
  }

  function getEffectiveProviderValues(sectionKey, finalProviderId) {
    const sectionRule = sectionRules[sectionKey] ?? buildEmptySectionRule(xpPerAmount)
    const providerRule = getProviderRuleByFinalProviderId(sectionKey, finalProviderId)

    return {
      enabled: providerRule ? providerRule.enabled : sectionRule.providersDefaultEnabled,
      xpPerAmount: providerRule ? providerRule.xpPerAmount : sectionRule.xpPerAmount,
      gamesDefaultEnabled: providerRule ? providerRule.gamesDefaultEnabled : true,
      providerRule,
    }
  }

  function getEffectiveGameValues(sectionKey, finalProviderId, finalGameId) {
    const providerValues = getEffectiveProviderValues(sectionKey, finalProviderId)
    const gameRule = getGameRuleByFinalIds(sectionKey, finalProviderId, finalGameId)

    return {
      enabled: gameRule ? gameRule.enabled : providerValues.gamesDefaultEnabled,
      xpPerAmount: gameRule ? gameRule.xpPerAmount : providerValues.xpPerAmount,
      gameRule,
    }
  }

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
              : sectionRule.providerRules
                .map(providerRule => {
                  const parentXp = String(sectionRule.xpPerAmount)
                  const defaultEnabled = Boolean(sectionRule.providersDefaultEnabled)

                  const gameRules = providerRule.gameRules
                    .filter(gameRule => {
                      const providerDefaultEnabled = Boolean(providerRule.gamesDefaultEnabled)
                      const providerDefaultXp = String(providerRule.xpPerAmount)

                      return (
                        Boolean(gameRule.enabled) !== providerDefaultEnabled ||
                        String(gameRule.xpPerAmount) !== providerDefaultXp
                      )
                    })
                    .map(gameRule => ({
                      finalGameId: Number(gameRule.finalGameId),
                      enabled: gameRule.enabled ? 1 : 0,
                      xpPerAmount: Number(gameRule.xpPerAmount),
                    }))

                  const providerChanged =
                    Boolean(providerRule.enabled) !== defaultEnabled ||
                    String(providerRule.xpPerAmount) !== parentXp ||
                    Boolean(providerRule.gamesDefaultEnabled) !== true ||
                    gameRules.length > 0

                  if (!providerChanged) {
                    return null
                  }

                  return {
                    finalProviderId: Number(providerRule.finalProviderId),
                    enabled: providerRule.enabled ? 1 : 0,
                    gamesDefaultEnabled: providerRule.gamesDefaultEnabled ? 1 : 0,
                    xpPerAmount: Number(providerRule.xpPerAmount),
                    gameRules,
                  }
                })
                .filter(Boolean),
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

  function renderSectionSettingsBlock(sectionKey, sectionRule, options = {}) {
    const {
      compact = false,
      withConfigureButton = false,
      withAddProviderButton = false,
    } = options

    return (
      <div className={`sectionSettingsCard ${compact ? 'sectionSettingsCard--compact' : ''}`}>
        <div className="sectionSettingsCard__top">
          <div>
            <div className="group__title">
              {SECTION_LABELS[sectionKey]}
              {sectionRule.id ? (
                <span className="badge">#{sectionRule.id}</span>
              ) : null}
            </div>

            <div className="hint">
              {sectionKey === 'sport'
                ? 'Sport section does not use provider rules'
                : 'Configure providers and games'}
            </div>
          </div>
        </div>

        <div className="sectionSettingsGrid">
          <div className="field">
            <div className="label">enabled</div>
            <ToggleSwitch
              checked={sectionRule.enabled}
              onChange={value => updateSectionRule(sectionKey, {enabled: value})}
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
              value={sectionRule.xpPerAmount}
              onChange={e => updateSectionRule(sectionKey, {xpPerAmount: e.target.value})}
            />
          </div>

          <div className="field">
            <div className="label">providersDefaultEnabled</div>
            <ToggleSwitch
              checked={sectionRule.providersDefaultEnabled}
              onChange={value => updateSectionRule(sectionKey, {providersDefaultEnabled: value})}
              variant="secondary"
              size="sm"
            />
          </div>
        </div>

        <div className="sectionSettingsCard__bottom">
          <div className="sectionSettingsCard__bottomLeft">
            <div className="hint">
              {sectionKey === 'sport' ? 'No provider rules for sport' : ''}
            </div>
          </div>

          <div className="sectionSettingsCard__bottomRight">
            {withConfigureButton ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => openSectionConfig(sectionKey)}
              >
                Configure
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
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
            aria-selected={activeTab === 'levels'}
            className={`switch__btn ${activeTab === 'levels' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('levels')}
          >
            Levels
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'configs-and-rules'}
            className={`switch__btn ${activeTab === 'configs-and-rules' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('configs-and-rules')}
          >
            Configs and Rules
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

            <div className="rulesSectionsGrid">
              {LEVEL_SECTIONS.map(sectionKey => {
                const sectionRule = sectionRules[sectionKey] ?? buildEmptySectionRule(xpPerAmount)

                return (
                  <div key={sectionKey} className="ruleSectionPreviewCard">
                    {renderSectionSettingsBlock(sectionKey, sectionRule, {
                      compact: true,
                      withConfigureButton: true,
                      withAddProviderButton: false,
                    })}
                  </div>
                )
              })}
            </div>

            {configSectionKey && (
              <div
                className="modalOverlay"
                onClick={e => {
                  if (e.target === e.currentTarget) {
                    closeSectionConfig()
                  }
                }}
              >
                <div className="modal modal__dark levelsSectionModal">
                  <div className="modal__header">
                    <div className="modal__title">
                      Configure {SECTION_LABELS[configSectionKey]}
                    </div>

                    <button
                      type="button"
                      className="btn"
                      onClick={closeSectionConfig}
                    >
                      Close
                    </button>
                  </div>

                  <div className="modal__body">
                    {(() => {
                      const sectionKey = configSectionKey
                      const sectionRule = sectionRules[sectionKey] ?? buildEmptySectionRule(xpPerAmount)

                      return (
                        <div className="stack">
                          {renderSectionSettingsBlock(sectionKey, sectionRule, {
                            withConfigureButton: false,
                            withAddProviderButton: false,
                          })}

                          {sectionKey === 'sport' ? (
                            <div className="empty">
                              Sport section does not use provider rules. providerRules will always be sent as an empty array.
                            </div>
                          ) : (() => {
                            const sectionCatalog = sectionCatalogs[sectionKey] ?? {
                              providers: [],
                              gamesByProviderId: {},
                            }

                            const providers = sectionCatalog.providers ?? []
                            const selectedProviderId = selectedProviderIdsBySection[sectionKey] ?? ''
                            const selectedProvider = providers.find(
                              item => String(item.finalProviderId) === String(selectedProviderId),
                            ) ?? null
                            const games = sectionCatalog.gamesByProviderId?.[String(selectedProviderId)] ?? []
                            const providerValues = selectedProviderId
                              ? getEffectiveProviderValues(sectionKey, selectedProviderId)
                              : null

                            const isSectionLocked = !sectionRule.enabled
                            const isLoadingSectionCatalog = Boolean(sectionCatalogsLoading[sectionKey])

                            return (
                              <div className="rulesProvidersWrap">
                                {!providers.length && isLoadingSectionCatalog && (
                                  <div className="empty">
                                    Loading providers...
                                  </div>
                                )}

                                {!providers.length && !isLoadingSectionCatalog && (
                                  <div className="empty">
                                    No providers found for this section.
                                  </div>
                                )}

                                {!!providers.length && (
                                  <>
                                    <div className="levelsRulesToolbar">
                                      <div className="field levelsRulesToolbar__providerSelect">
                                        <div className="label">provider</div>

                                        <select
                                          className="select"
                                          value={selectedProviderId}
                                          onChange={e => {
                                            const nextProviderId = e.target.value

                                            setSelectedProviderIdsBySection(prev => ({
                                              ...prev,
                                              [sectionKey]: nextProviderId,
                                            }))
                                          }}
                                        >
                                          {providers.map(provider => (
                                            <option
                                              key={provider.finalProviderId}
                                              value={String(provider.finalProviderId)}
                                            >
                                              {provider.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      {providerValues ? (
                                        <div className="levelsRulesToolbar__providerSettings">
                                          <div className="field">
                                            <div className="label">enabled</div>
                                            <ToggleSwitch
                                              checked={providerValues.enabled}
                                              disabled={isSectionLocked}
                                              onChange={value => upsertProviderRuleByFinalProviderId(sectionKey, selectedProviderId, {
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
                                              value={providerValues.xpPerAmount}
                                              disabled={isSectionLocked}
                                              onChange={e => upsertProviderRuleByFinalProviderId(sectionKey, selectedProviderId, {
                                                xpPerAmount: e.target.value,
                                              })}
                                            />
                                          </div>

                                          <div className="field">
                                            <div className="label">gamesDefaultEnabled</div>
                                            <ToggleSwitch
                                              checked={providerValues.gamesDefaultEnabled}
                                              disabled={isSectionLocked}
                                              onChange={value => upsertProviderRuleByFinalProviderId(sectionKey, selectedProviderId, {
                                                gamesDefaultEnabled: value,
                                              })}
                                              variant="secondary"
                                              size="sm"
                                            />
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>

                                    {selectedProvider ? (
                                      <div className="mutedSmall">
                                        Provider: {selectedProvider.name} #{selectedProvider.finalProviderId}
                                      </div>
                                    ) : null}

                                    {isLoadingSectionCatalog && !games.length ? (
                                      <div className="empty">
                                        Loading games...
                                      </div>
                                    ) : !games.length ? (
                                      <div className="empty">
                                        No games found for selected provider.
                                      </div>
                                    ) : (
                                      <div className="rulesGamesList">
                                        {games.map(game => {
                                          const gameValues = getEffectiveGameValues(
                                            sectionKey,
                                            selectedProviderId,
                                            game.finalGameId,
                                          )

                                          const isGameLockedBySection = !sectionRule.enabled
                                          const isGameLockedByProvider = !providerValues?.enabled
                                          const isGameLocked = isGameLockedBySection || isGameLockedByProvider

                                          return (
                                            <div
                                              key={game.finalGameId}
                                              className={`gameRuleCard ${isGameLocked ? 'is-disabled' : ''}`}
                                            >
                                              <div className="gameRuleCard__row">
                                                <div className="ruleEntityInfo">
                                                  {game.image?.dfImg ? (
                                                    <img
                                                      className="ruleEntityThumb"
                                                      src={'https://st.ma-ruay.com' + game.image.dfImg}
                                                      alt={game.name || `Game ${game.finalGameId}`}
                                                    />
                                                  ) : (
                                                    <div className="ruleEntityThumb ruleEntityThumb--placeholder">
                                                      G
                                                    </div>
                                                  )}

                                                  <div className="ruleEntityInfo__text">
                                                    <div className="ruleEntityInfo__name">
                                                      {game.name || `Game #${game.finalGameId}`}
                                                    </div>

                                                    <div className="ruleEntityInfo__meta">
                                                      finalGameId: {game.finalGameId}
                                                    </div>
                                                  </div>
                                                </div>

                                                <div className="field">
                                                  <div className="label">enabled</div>
                                                  <ToggleSwitch
                                                    checked={gameValues.enabled}
                                                    disabled={isGameLocked}
                                                    onChange={value => upsertGameRuleByFinalIds(
                                                      sectionKey,
                                                      selectedProviderId,
                                                      game.finalGameId,
                                                      {
                                                        enabled: value,
                                                      },
                                                    )}
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
                                                    value={gameValues.xpPerAmount}
                                                    disabled={isGameLocked}
                                                    onChange={e => upsertGameRuleByFinalIds(
                                                      sectionKey,
                                                      selectedProviderId,
                                                      game.finalGameId,
                                                      {
                                                        xpPerAmount: e.target.value,
                                                      },
                                                    )}
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}
                  </div>

                  <div className="levelsSectionModal__footer">
                    <button
                      style={{minWidth: 120}}
                      type="button"
                      className="btn btn--primary"
                      onClick={closeSectionConfig}
                    >
                      Ok
                    </button>
                  </div>
                </div>
              </div>
            )}
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
