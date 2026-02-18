import React, {useEffect, useMemo, useState} from 'react'
import {Routes, Route, Navigate, useNavigate, useSearchParams, useParams} from 'react-router-dom'
import AppHeader from './components/AppHeader.jsx'
import TagBuilder from './components/TagBuilder.jsx'
import TagList from './components/TagList.jsx'
import UsersWithSegmentsAndTags from './components/UsersWithSegmentsAndTags.jsx'
import SegmentStatisticsCharts from './components/SegmentStatisticsCharts.jsx'
import UserHistoryCharts from './components/UserHistoryCharts.jsx'
import {api} from './lib/api.js'
import {uid} from './lib/uid.js'
import {getAccessToken} from './lib/auth.js'
import AuthPage from './components/AuthPage.jsx'
import SegmentsPage from './components/SegmentsPage.jsx'

function RequireAuth({children}) {
  const token = getAccessToken()
  if (!token) return <Navigate to="/auth" replace/>
  return children
}

function ProtectedLayout({children}) {
  return (
    <>
      <AppHeader/>
      {children}
    </>
  )
}

function TagsPage() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const [mode, setMode] = useState('create')
  const [editingTag, setEditingTag] = useState(null)

  async function loadTags() {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.listTags()
      setTags(Array.isArray(data) ? data : (data?.tags ?? data?.data ?? []))
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
  }, [])

  const initialCreateState = useMemo(() => ({
    name: '',
    color: '#e5e7eb',
    active: 1,
    persistent: 0,
    groups: [
      {
        _id: uid(),
        connector: 'and',
        sort: 1,
        rules: [
          {
            _id: uid(),
            connector: 'and',
            event: 'deposit',
            aggregation: 'some',
            metric: 'amount',
            operator: 'gte',
            valueFrom: '',
            valueTo: null,
            periodValue: 240,
            periodUnit: 'day',
            sort: 1,
          },
        ],
      },
    ],
  }), [])

  function startEdit(tag) {
    setMode('edit')
    const normalized = {
      id: tag.id,
      name: tag.name ?? '',
      color: tag.color ?? '#e5e7eb',
      active: Number(tag.active ?? 0) ? 1 : 0,
      persistent: Number(tag.persistent ?? 0) ? 1 : 0,
      groups: (tag.groups ?? []).map((g, gi) => ({
        _id: uid(),
        connector: g.connector ?? 'and',
        sort: g.sort ?? gi + 1,
        rules: (g.rules ?? []).map((r, ri) => ({
          _id: uid(),
          connector: r.connector ?? 'and',
          event: r.event ?? 'deposit',
          aggregation: r.aggregation ?? 'some',
          metric: r.metric ?? null,
          operator: r.operator ?? 'gte',
          valueFrom: r.valueFrom ?? r.value_from ?? '',
          valueTo: r.valueTo ?? r.value_to ?? null,
          periodValue: String(Number(r.periodValue ?? r.period_value ?? 1)),
          periodUnit: r.periodUnit ?? r.period_unit ?? 'day',
          sort: r.sort ?? ri + 1,
        })),
      })),
    }
    if (!normalized.groups.length) normalized.groups = initialCreateState.groups
    setEditingTag(normalized)
  }

  function cancelEdit() {
    setMode('create')
    setEditingTag(null)
  }

  async function onCreate(payload) {
    await api.createTag(payload)
    await loadTags()
  }

  async function onUpdate(tagId, payload) {
    await api.updateTag(tagId, payload)
    await loadTags()
    cancelEdit()
  }

  async function onDelete(tagId) {
    await api.deleteTag(tagId)
    await loadTags()
    if (mode === 'edit' && editingTag?.id === tagId) cancelEdit()
  }

  return (
    <>
      <div className="stack">
        <header className="row row--space">
          <div className="brand">
            <div className="brand__title">Tags</div>
            <div className="brand__subtitle">Create / edit rules & groups</div>
          </div>
          <div className="row row--gap">
            <button className="btn" onClick={loadTags} disabled={loading}>Refresh</button>
          </div>
        </header>

        <main className="grid">
          <section className="card">
            <div className="card__header">
              <div className="card__title">{mode === 'edit' ? 'Edit tag' : 'Create tag'}</div>
              {mode === 'edit' && (
                <button className="btn btn--ghost" onClick={cancelEdit}>Cancel edit</button>
              )}
            </div>

            {err && <div className="alert alert--error">{err}</div>}

            <TagBuilder
              mode={mode}
              initialState={mode === 'edit' ? editingTag : initialCreateState}
              onCreate={onCreate}
              onUpdate={onUpdate}
            />
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">Your tags</div>
              <div className="pill">{loading ? 'Loading…' : `${tags.length} items`}</div>
            </div>

            <TagList tags={tags} onEdit={startEdit} onDelete={onDelete}/>
          </section>
        </main>
      </div>
    </>
  )
}

function UsersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const page = Number(search.get('page') || 0)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <div className="stack">
        <header className="row row--space">
          <div className="brand">
            <div className="brand__title">Users</div>
            <div className="brand__subtitle">Segments & tags</div>
          </div>
          <div className="row row--gap">
            <button className="btn" onClick={() => setRefreshKey(x => x + 1)}>
              Refresh
            </button>
          </div>
        </header>

        <section className="card">
          <div className="card__header">
            <div className="card__title">Segment statistics</div>
            <div className="card__subtitle">By period and intervals</div>
          </div>

          <SegmentStatisticsCharts refreshKey={refreshKey} />
        </section>

        <section className="card">
          <UsersWithSegmentsAndTags
            page={page}
            refreshKey={refreshKey}
            onPageChange={(p) => setSearch({page: String(p)})}
            onOpenUser={(u) => navigate(`/users/${u.id}/history`)}
          />
        </section>
      </div>
    </>
  )
}

function HistoryPage() {
  const navigate = useNavigate()
  const params = useParams()
  const userId = Number(params.userId)

  return (
    <>
      <div className="stack">
        <header className="row row--space">
          <div className="brand">
            <div className="brand__title">History</div>
            <div className="brand__subtitle">User #{userId}</div>
          </div>
          <div className="topbar__actions">
          </div>
        </header>

        <section className="card">
          <UserHistoryCharts
            user={{id: userId}}
            onBack={() => navigate('/users')}
          />
        </section>
      </div>
    </>
  )
}

export default function App() {
  return (
    <div className="page">
      <Routes>
        <Route path="/auth" element={<AuthPage/>}/>

        <Route
          path="/"
          element={
            getAccessToken()
              ? <Navigate to="/tags" replace/>
              : <Navigate to="/auth" replace/>
          }
        />

        <Route
          path="/tags"
          element={
            <RequireAuth>
              <ProtectedLayout>
                <TagsPage/>
              </ProtectedLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/segments"
          element={
            <RequireAuth>
              <ProtectedLayout>
                <SegmentsPage/>
              </ProtectedLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/users"
          element={
            <RequireAuth>
              <ProtectedLayout>
                <UsersPage/>
              </ProtectedLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/users/:userId/history"
          element={
            <RequireAuth>
              <ProtectedLayout>
                <HistoryPage/>
              </ProtectedLayout>
            </RequireAuth>
          }
        />

        <Route
          path="*"
          element={
            getAccessToken()
              ? <Navigate to="/tags" replace/>
              : <Navigate to="/auth" replace/>
          }
        />
      </Routes>
    </div>
  )
}
