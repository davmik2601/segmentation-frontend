import React, {useEffect, useMemo, useRef, useState} from 'react'
import {api} from '../lib/api.js'

function fmtDate(v) {
  if (!v) return ''
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

function SelectableChip({active, text, color, title, onClick}) {
  return (
    <span
      className="chip"
      onClick={onClick}
      title={title || text}
      style={{
        ...(color ? {background: color} : {}),
        height: '34px',
        cursor: 'pointer',
        userSelect: 'none',
        borderColor: active ? '#b6ff00' : undefined,
        borderWidth: active ? '5px' : undefined,
        boxShadow: active ? '0 0 0 2px rgba(255,255,255,0.16) inset' : undefined,
        opacity: active ? 1 : 0.75,
      }}
    >
      {active ? '✓ ' : ''}{text}
    </span>
  )
}

function MultiSelectPopover({label, options, selectedIds, onChange}) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onDoc(e) {
      if (!open) return
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }

    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  return (
    <div ref={ref} style={{position: 'relative', display: 'inline-block'}}>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => setOpen(v => !v)}
        style={{display: 'inline-flex', alignItems: 'center', gap: 8}}
        title={label}
      >
        <span>{label}</span>
        <span className="mutedSmall">
          {selectedIds.length ? `(${selectedIds.length})` : '(all)'}
        </span>
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            zIndex: 60,
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: 12,
            minWidth: 440,
            maxWidth: 520,
          }}
        >
          <div className="row row--space" style={{marginBottom: 10}}>
            <div className="card__title" style={{fontSize: 13}}>{label}</div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>

          <div className="chips">
            {options.map(o => (
              <SelectableChip
                key={o.id}
                active={selectedSet.has(o.id)}
                text={o.name}
                color={o.color}
                title={o.description}
                onClick={() => {
                  const next = new Set(selectedSet)
                  if (next.has(o.id)) next.delete(o.id)
                  else next.add(o.id)
                  onChange(Array.from(next))
                }}
              />
            ))}
          </div>

          <div className="row row--space" style={{marginTop: 10}}>
            <div className="mutedSmall">
              Tip: select <b>0</b> to include users with no {label.toLowerCase()}.
            </div>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function UsersWithSegmentsAndTags({onBack, onOpenUser, page, onPageChange, refreshKey}) {
  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({count: 0})
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  // filters
  const [filterSearch, setFilterSearch] = useState('')
  const [segmentIds, setSegmentIds] = useState([]) // numbers
  const [tagIds, setTagIds] = useState([]) // numbers

  // data for filter lists
  const [segments, setSegments] = useState([])
  const [tags, setTags] = useState([])

  const limit = 50
  const offset = page * limit

  const pageCount = useMemo(() => {
    const c = Number(meta?.count ?? 0)
    return c ? Math.ceil(c / limit) : 1
  }, [meta, limit])

  const segmentOptions = useMemo(() => {
    // include id=0 special meaning
    return [
      {id: 0, name: '0 — No segment', color: 'rgba(255,255,255,0.06)', description: 'Include users with no segment'},
      ...segments.map(s => ({
        id: Number(s.id),
        name: `${s.id} — ${s.name || s.slug}`,
        color: s.color || undefined,
        description: s.description || '',
      })),
    ]
  }, [segments])

  const tagOptions = useMemo(() => {
    return [
      {id: 0, name: '0 — No tag', color: 'rgba(255,255,255,0.06)', description: 'Include users with no tags'},
      ...tags.map(t => ({
        id: Number(t.id),
        name: `${t.id} — ${t.name || t.slug}`,
        color: t.color || undefined,
        description: t.description || '',
      })),
    ]
  }, [tags])

  async function load({signal} = {}) {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.getUsersWithSegmentsAndTags({
        limit,
        offset,
        search: filterSearch || undefined,
        segmentIds: segmentIds.length ? segmentIds.join(',') : undefined,
        tagIds: tagIds.length ? tagIds.join(',') : undefined,
      })
      if (signal?.aborted) return
      setUsers(res?.users ?? [])
      setMeta(res?.meta ?? {count: 0})
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const Pagination = (
    <div className="row row--space">
      <div className="mutedSmall">
        Total: <b>{Number(meta?.count ?? 0)}</b> • Page <b>{page + 1}</b> / <b>{pageCount}</b>
        {loading ? <span> • loading…</span> : null}
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
  )

  // fetch segments + active tags once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [segRes, tagRes] = await Promise.all([
          api.getSegments(),
          api.listTags({active: 1}), // active tags only
        ])
        if (cancelled) return
        setSegments(segRes?.segments ?? [])
        setTags(tagRes?.tags ?? [])
      } catch (e) {
        if (cancelled) return
        setErr(e?.message || String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // main load: page + filters (debounced for typing)
  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => load({signal: ctrl.signal}), 400)
    localStorage.setItem('ui:usersPage', String(page))
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterSearch, segmentIds.join(','), tagIds.join(',')])

  // external refresh
  useEffect(() => {
    if (refreshKey === undefined) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  function resetToFirstPage() {
    if (page !== 0) onPageChange?.(0)
  }

  return (
    <div className="stack">
      {err && <div className="alert alert--error">{err}</div>}

      <div className="card" style={{padding: 12, backgroundColor: '#252e42', border: '1px solid grey'}}>
        <div className="row row--space" style={{alignItems: 'flex-start', gap: 12, flexWrap: 'wrap'}}>
          <div className="field" style={{minWidth: 380, maxWidth: 500, flex: '0.6 1 auto'}}>
            <div className="label">Search</div>
            <input
              className="input"
              placeholder="ID / email / username"
              value={filterSearch}
              onChange={e => {
                setFilterSearch(e.target.value)
                resetToFirstPage()
              }}
            />
          </div>

          <div className="field" style={{minWidth: 200, flex: '0 0 auto'}}>
            <div className="label">Segments</div>
            <MultiSelectPopover
              label="Select segments"
              options={segmentOptions}
              selectedIds={segmentIds}
              onChange={(ids) => {
                setSegmentIds(ids)
                resetToFirstPage()
              }}
            />
            {!!segmentIds.length && (
              <div className="mutedSmall" style={{marginTop: 6}}>
                segmentIds: <span className="mono">{segmentIds.join(',')}</span>
              </div>
            )}
          </div>

          <div className="field" style={{minWidth: 200, flex: '0 0 auto'}}>
            <div className="label">Tags</div>
            <MultiSelectPopover
              label="Select tags"
              options={tagOptions}
              selectedIds={tagIds}
              onChange={(ids) => {
                setTagIds(ids)
                resetToFirstPage()
              }}
            />
            {!!tagIds.length && (
              <div className="mutedSmall" style={{marginTop: 6}}>
                tagIds: <span className="mono">{tagIds.join(',')}</span>
              </div>
            )}
          </div>

          <div className="field" style={{minWidth: 120, flex: '0 0 auto', marginLeft: 'auto'}}>
            <div className="label">&nbsp;</div>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setFilterSearch('')
                setSegmentIds([])
                setTagIds([])
                resetToFirstPage()
              }}
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="mutedSmall" style={{marginTop: 10}}>
          Tip: include <b>0</b> in segments/tags to include users with no segment/tags.
        </div>
      </div>

      {Pagination}

      <div className="tableWrap">
        <table className="table">
          <thead>
          <tr>
            <th style={{width: 80}}>ID</th>
            <th style={{width: 320}}>Email</th>
            <th style={{width: 340}}>Segment / Segmented At</th>
            <th>Tags</th>
          </tr>
          </thead>

          <tbody>
          {users.map(u => {
            const seg = u.segment || null
            const tagsArr = Array.isArray(u.tags) ? u.tags : []
            return (
              <tr
                key={u.id}
                className="tableRowClickable"
                onClick={() => onOpenUser?.(u)}
              >
                <td className="mono">{u.id}</td>
                <td className="mono">{u.email || ''}</td>

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
                    {tagsArr.length ? (
                      tagsArr.map(t => (
                        <Badge
                          key={t.id}
                          text={t.name || t.slug}
                          description={`${t.description || ''} (${t.persistent ? 'persistent' : 'non-persistent'})`}
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
              <td colSpan={4}>
                <div className="empty">No users found.</div>
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>

      {Pagination}
    </div>
  )
}
