import {clearAccessToken, getAccessToken} from './auth.js'

const isLocal = import.meta.env.VITE_ENV === 'local'

const BASE = '' // because vite proxy routes /api/backoffice
export const API_PREFIX = 'gtestbet' // for local development use 'gtestbet'

function withPrefix(method, body) {
  if (!isLocal) return body

  if (method.toUpperCase() === 'GET') {
    return {...body, prefix: API_PREFIX}
  }

  return {...body, prefix: API_PREFIX}
}

async function req(path, {method = 'GET', body} = {}) {
  body = withPrefix(method, body)

  let url = `${BASE}${path}`

  // if GET and body exists → treat body as query params
  if (method.toUpperCase() === 'GET' && body && typeof body === 'object') {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, String(v)))
      } else {
        params.append(key, String(value))
      }
    }
    const qs = params.toString()
    if (qs) url += (url.includes('?') ? `&${qs}` : `?${qs}`)
    body = undefined
  }

  const token = getAccessToken()

  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearAccessToken()
    // hard redirect so user can't stay on protected pages
    window.location.assign('/auth')
    return
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `${res.status} ${res.statusText}`
    throw new Error(msg)
  }

  return data
}

export const api = {
  listTags: (params) => req('/api/tags', {body: params}),

  createTag: (payload) =>
    req('/api/tags/create', {method: 'POST', body: {...payload}}),

  updateTag: (id, payload) =>
    req('/api/tags/update', {method: 'POST', body: {id, ...payload}}),

  deleteTag: (id) =>
    req('/api/tags/delete', {method: 'POST', body: {id}}),

  getUsersWithSegmentsAndTags: ({limit, offset, userId, search, segmentIds, tagIds}) =>
    req('/api/users/segments-and-tags', {
      body: {
        limit,
        offset,
        ...(userId !== undefined && userId !== null && userId !== '' ? {userId} : {}),
        ...(search ? {search} : {}),
        ...(segmentIds ? {segmentIds} : {}), // comma-separated: "0,1,3"
        ...(tagIds ? {tagIds} : {}),         // comma-separated: "0,4,5"
      },
    }),

  getUserHistory: ({userId, from, to, limit = 5000, offset = 0}) =>
    req(
      `/api/users/history?` +
      `userId=${encodeURIComponent(userId)}` +
      `&from=${encodeURIComponent(from)}` +
      (to !== undefined && to !== null ? `&to=${encodeURIComponent(to)}` : '') +
      `&limit=${limit}&offset=${offset}`,
    ),

  getSegments: () =>
    req(`/api/segments`),

  setupSegments: ({timeRangeDays, configs}) =>
    req('/api/segments/setup', {
      method: 'POST',
      body: {
        timeRangeDays,
        configs,
      },
    }),

  getSegmentStatistics: ({from, to, interval}) =>
    req('/api/statistics/segments', {
      body: {
        ...(from !== undefined && from !== null ? {from} : {}),
        ...(to !== undefined && to !== null ? {to} : {}),
        interval,
      },
    }),
}
