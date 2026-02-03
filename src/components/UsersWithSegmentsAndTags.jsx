import React, {useEffect, useMemo, useState} from 'react'
import {api} from '../lib/api.js'

function fmtDate(v) {
  if (!v) return ''
  // if your BE sends ms epoch -> Date(ms)
  // if seconds epoch -> Date(sec*1000)
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  const ms = n > 10_000_000_000 ? n : n * 1000
  return new Date(ms).toLocaleString()
}

function Badge({text, color, muted, description}) {
  return (
    <span
      className={`chip ${muted ? 'chip--muted' : ''}`}
      style={color ? {background: color} : undefined}
      title={description || text}
    >
      {text} &nbsp; ⓘ
    </span>
  )
}

export default function UsersWithSegmentsAndTags({prefix = 'gtestbet', onBack, onOpenUser, page, onPageChange}) {
  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({count: 0})
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const limit = 20

  const offset = page * limit

  const pageCount = useMemo(() => {
    const c = Number(meta?.count ?? 0)
    return c ? Math.ceil(c / limit) : 1
  }, [meta])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.getUsersWithSegmentsAndTags({prefix, limit, offset})
      setUsers(res?.users ?? [])
      setMeta(res?.meta ?? {count: 0})
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    localStorage.setItem('ui:usersPage', String(page))
  }, [page])

  return (
    <div className="stack">
      <div className="row row--space">
        <div className="sectionTitle">Users with segments & tags</div>
        <div className="row row--gap">
          <button className="btn btn--ghost" onClick={onBack}>Back</button>
          <button className="btn" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="tableWrap">
        <table className="table">
          <thead>
          <tr>
            <th style={{width: 80}}>ID</th>
            <th style={{width: 320}}>Email</th>
            {/*<th style={{width: 160}}>Phone</th>*/}
            <th style={{width: 340}}>Segment / Segmented At</th>
            <th>Tags</th>
          </tr>
          </thead>
          <tbody>
          {users.map(u => {
            const seg = u.segment || null
            const tags = Array.isArray(u.tags) ? u.tags : []
            return (
              <tr
                key={u.id}
                className="tableRowClickable"
                onClick={() => onOpenUser?.(u)}
              >
                <td className="mono">{u.id}</td>
                <td className="mono">{u.email || ''}</td>
                {/*<td className="mono">{u.phone || ''}</td>*/}
                <td>
                  <div className="stack stack--tight">
                    <div className="row row--gap" style={{flexWrap: 'wrap'}}>
                      <Badge
                        text={seg?.name || seg?.slug || 'No segment'}
                        description={seg?.description}
                        color={seg?.color || undefined}
                        muted={!seg}
                      />
                      <span className="mutedSmall">{fmtDate(u.segmentedAt)}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="chips">
                    {tags.length ? (
                      tags.map(t => (
                        <Badge
                          key={t.id}
                          text={t.name || t.slug}
                          description={`${t.description} (${t.persistent ? 'persistent' : 'non-persistent'})`}
                          color={t.color || undefined}
                        />
                      ))
                    ) : (
                      <span className="mutedSmall">no tags</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}

          {!loading && users.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty">No users found.</div>
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>

      <div className="row row--space">
        <div className="mutedSmall">
          Total: <b>{Number(meta?.count ?? 0)}</b> • Page <b>{page + 1}</b> / <b>{pageCount}</b>
        </div>

        <div className="row row--gap">
          <button className="btn" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0 || loading}>
            Prev
          </button>

          <button
            className="btn"
            onClick={() => onPageChange(page + 1 < pageCount ? page + 1 : page)}
            disabled={page + 1 >= pageCount || loading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
