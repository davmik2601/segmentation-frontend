const BASE = '' // because vite proxy routes /api -> http://localhost:3030
export const API_PREFIX = 'gtestbet'

async function req(path, {method = 'GET', body} = {}) {
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
    if (qs) url += `?${qs}`
    body = undefined
  }

  const res = await fetch(url, {
    method,
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

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
  listTags: () => req(`/api/tags?prefix=${encodeURIComponent(API_PREFIX)}`),

  createTag: (payload) =>
    req('/api/tags/create', {method: 'POST', body: {...payload, prefix: API_PREFIX}}),

  updateTag: (id, payload) =>
    req('/api/tags/update', {method: 'POST', body: {id, ...payload, prefix: API_PREFIX}}),

  deleteTag: (id) =>
    req('/api/tags/delete', {method: 'POST', body: {id, prefix: API_PREFIX}}),

  getUsersWithSegmentsAndTags: ({limit, offset}) =>
    req(`/api/users/segments-and-tags?prefix=${encodeURIComponent(API_PREFIX)}&limit=${limit}&offset=${offset}`),

  getUserHistory: ({userId, from, to, limit = 5000, offset = 0}) =>
    req(
      `/api/users/history?` +
      `prefix=${encodeURIComponent(API_PREFIX)}` +
      `&userId=${encodeURIComponent(userId)}` +
      `&from=${encodeURIComponent(from)}` +
      (to !== undefined && to !== null ? `&to=${encodeURIComponent(to)}` : '') +
      `&limit=${limit}&offset=${offset}`,
    ),
}
