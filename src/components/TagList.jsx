import React, {useMemo, useState} from 'react'

function safeString(v) {
  if (v == null) return ''
  return String(v)
}

function safeEmoji(v) {
  if (v == null) return ''
  return String(v).trim()
}

export default function TagList({tags, onEdit, onDelete}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return tags
    return tags.filter(t => safeString(t.name).toLowerCase().includes(qq))
  }, [tags, q])

  return (
    <div className="stack">
      <div className="row">
        <input
          className="input"
          placeholder="Search by name…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="list">
        {filtered.map(tag => {
          const color = tag.color || '#e5e7eb'
          const emoji = safeEmoji(tag.emoji)
          const active = Number(tag.active ?? 0) === 1
          const groupsCount = (tag.groups?.length ?? 0)
          const rulesCount = (tag.groups ?? []).reduce((acc, g) => acc + (g.rules?.length ?? 0), 0)

          return (
            <div key={tag.id} className="list__item">
              <div className="list__left">
                <div className="dot" style={{background: color}}/>
                <div
                  style={{
                    width: 28,
                    minWidth: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  {emoji || ''}
                </div>
                <div className="list__meta">
                  <div className="list__title">
                    {tag.name}
                    {!active && <span className="badge badge--muted">inactive</span>}
                  </div>
                  <div className="list__subtitle">
                    {groupsCount} group(s) • {rulesCount} rule(s)
                  </div>
                </div>
              </div>

              <div className="list__right">
                <button className="btn btn--ghost" onClick={() => onEdit(tag)}>
                  Edit
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    const ok = window.confirm(`Delete "${tag.name}"?`)
                    if (ok) onDelete(tag.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}

        {!filtered.length && (
          <div className="empty">
            No tags found.
          </div>
        )}
      </div>
    </div>
  )
}
