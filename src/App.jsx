import React, {useEffect, useMemo, useState} from 'react'
import {Routes, Route, Navigate, useNavigate, useSearchParams, useParams} from 'react-router-dom'
import TagBuilder from './components/TagBuilder.jsx'
import TagList from './components/TagList.jsx'
import UsersWithSegmentsAndTags from './components/UsersWithSegmentsAndTags.jsx'
import UserHistoryCharts from './components/UserHistoryCharts.jsx'
import {api} from './lib/api.js'
import {uid} from './lib/uid.js'

// export default function App() {
//   const [tags, setTags] = useState([])
//   const [loading, setLoading] = useState(false)
//   const [err, setErr] = useState(null)
//
//   const [mode, setMode] = useState('create') // 'create' | 'edit'
//   const [editingTag, setEditingTag] = useState(null)
//
//   const [view, setView] = useState(() => localStorage.getItem('ui:view') || 'tags')
//
//   const [selectedUser, setSelectedUser] = useState(() => {
//     const raw = localStorage.getItem('ui:selectedUser')
//     return raw ? JSON.parse(raw) : null
//   })
//
//   async function loadTags() {
//     setLoading(true)
//     setErr(null)
//     try {
//       const data = await api.listTags({prefix: 'gtestbet'})
//       setTags(Array.isArray(data) ? data : (data?.tags ?? data?.data ?? []))
//     } catch (e) {
//       setErr(e?.message || String(e))
//     } finally {
//       setLoading(false)
//     }
//   }
//
//   useEffect(() => {
//     localStorage.setItem('ui:view', view)
//     if (view === 'tags') {
//       loadTags()
//     }
//   }, [view])
//
//   useEffect(() => {
//     if (selectedUser) localStorage.setItem('ui:selectedUser', JSON.stringify(selectedUser))
//     else localStorage.removeItem('ui:selectedUser')
//   }, [selectedUser])
//
//   const initialCreateState = useMemo(() => {
//     return {
//       prefix: 'gtestbet',
//       name: '',
//       active: 1,
//       groups: [
//         {
//           _id: uid(),
//           connector: 'and',
//           sort: 1,
//           rules: [
//             {
//               _id: uid(),
//               connector: 'and',
//               event: 'deposit',
//               aggregation: 'some',
//               metric: 'amount',
//               operator: 'gte',
//               valueFrom: '',
//               valueTo: null,
//               periodValue: 240,
//               periodUnit: 'day',
//               sort: 1,
//             },
//           ],
//         },
//       ],
//     }
//   }, [])
//
//   function startEdit(tag) {
//     setMode('edit')
//     // normalize to builder shape and add _id fields
//     const normalized = {
//       id: tag.id,
//       prefix: 'gtestbet',
//       name: tag.name ?? '',
//       active: Number(tag.active ?? 0) ? 1 : 0,
//       groups: (tag.groups ?? []).map((g, gi) => ({
//         _id: uid(),
//         connector: g.connector ?? 'and',
//         sort: g.sort ?? gi + 1,
//         rules: (g.rules ?? []).map((r, ri) => ({
//           _id: uid(),
//           connector: r.connector ?? 'and',
//           event: r.event ?? 'deposit',
//           aggregation: r.aggregation ?? 'some',
//           metric: r.metric ?? null,
//           operator: r.operator ?? 'gte',
//           valueFrom: r.valueFrom ?? r.value_from ?? '',
//           valueTo: r.valueTo ?? r.value_to ?? null,
//           periodValue: r.periodValue === '' || r.periodValue == null ? 240 : Number(r.periodValue),
//           periodUnit: r.periodUnit ?? r.period_unit ?? 'day',
//           sort: r.sort ?? ri + 1,
//         })),
//       })),
//     }
//
//     // if empty groups from API, keep at least one group+rule
//     if (!normalized.groups.length) {
//       normalized.groups = initialCreateState.groups
//     }
//
//     setEditingTag(normalized)
//   }
//
//   function cancelEdit() {
//     setMode('create')
//     setEditingTag(null)
//   }
//
//   async function onCreate(payload) {
//     await api.createTag(payload)
//     await loadTags()
//   }
//
//   async function onUpdate(tagId, payload) {
//     await api.updateTag(tagId, payload)
//     await loadTags()
//     cancelEdit()
//   }
//
//   async function onDelete(tagId) {
//     await api.deleteTag(tagId)
//     await loadTags()
//     if (mode === 'edit' && editingTag?.id === tagId) cancelEdit()
//   }
//
//   return (
//     <div className="page">
//       <header className="topbar">
//         <div className="brand">
//           <div className="brand__title">Tags</div>
//           <div className="brand__subtitle">Create / edit rules & groups</div>
//         </div>
//
//         <div className="topbar__actions">
//           <button
//             className="btn btn--ghost"
//             onClick={() => {
//               setView(v => (v === 'tags' ? 'users' : 'tags'))
//               if (view !== 'tags') setSelectedUser(null)
//             }}
//           >
//             {view === 'tags' ? 'Users' : 'Tags'}
//           </button>
//
//           <button className="btn" onClick={loadTags} disabled={loading || view !== 'tags'}>
//             Refresh
//           </button>
//         </div>
//       </header>
//
//       {view === 'users' ? (
//         <section className="card">
//           <UsersWithSegmentsAndTags
//             prefix="gtestbet"
//             onBack={() => setView('tags')}
//             onOpenUser={(u) => {
//               setSelectedUser(u)
//               setView('history')
//             }}
//           />
//         </section>
//       ) : view === 'history' ? (
//         <section className="card">
//           <UserHistoryCharts
//             user={selectedUser}
//             onBack={() => setView('users')}
//           />
//         </section>
//       ) : (
//         <main className="grid">
//
//           <section className="card">
//             {/* builder (same as you have now) */}
//             <div className="card__header">
//               <div className="card__title">{mode === 'edit' ? 'Edit tag' : 'Create tag'}</div>
//               {mode === 'edit' && (
//                 <button className="btn btn--ghost" onClick={cancelEdit}>
//                   Cancel edit
//                 </button>
//               )}
//             </div>
//
//             {err && <div className="alert alert--error">{err}</div>}
//
//             <TagBuilder
//               mode={mode}
//               initialState={mode === 'edit' ? editingTag : initialCreateState}
//               onCreate={onCreate}
//               onUpdate={onUpdate}
//             />
//           </section>
//
//           <section className="card">
//             {/* list (same as you have now) */}
//             <div className="card__header">
//               <div className="card__title">Your tags</div>
//               <div className="pill">{loading ? 'Loading…' : `${tags.length} items`}</div>
//             </div>
//
//             <TagList tags={tags} onEdit={startEdit} onDelete={onDelete}/>
//           </section>
//
//         </main>
//       )}
//     </div>
//   )
// }

function TagsPage() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const [mode, setMode] = useState('create')
  const [editingTag, setEditingTag] = useState(null)

  const navigate = useNavigate()

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
    prefix: 'gtestbet',
    name: '',
    active: 1,
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
      prefix: 'gtestbet',
      name: tag.name ?? '',
      active: Number(tag.active ?? 0) ? 1 : 0,
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
      <header className="topbar">
        <div className="brand">
          <div className="brand__title">Tags</div>
          <div className="brand__subtitle">Create / edit rules & groups</div>
        </div>
        <div className="topbar__actions">
          <button className="btn btn--ghost" onClick={() => navigate('/users')}>
            Users
          </button>
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

          <TagList tags={tags} onEdit={startEdit} onDelete={onDelete} />
        </section>
      </main>
    </>
  )
}

function UsersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const page = Number(search.get('page') || 0)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand__title">Users</div>
          <div className="brand__subtitle">Segments & tags</div>
        </div>
        <div className="topbar__actions">
          <button className="btn btn--ghost" onClick={() => navigate('/tags')}>Tags</button>
        </div>
      </header>

      <section className="card">
        <UsersWithSegmentsAndTags
          prefix="gtestbet"
          page={page}
          onPageChange={(p) => setSearch({page: String(p)})}
          onOpenUser={(u) => navigate(`/users/${u.id}/history`)}
        />
      </section>
    </>
  )
}

function HistoryPage() {
  const navigate = useNavigate()
  const params = useParams()
  const userId = Number(params.userId)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand__title">History</div>
          <div className="brand__subtitle">User #{userId}</div>
        </div>
        <div className="topbar__actions">
          <button className="btn btn--ghost" onClick={() => navigate('/users')}>Users</button>
          <button className="btn btn--ghost" onClick={() => navigate('/tags')}>Tags</button>
        </div>
      </header>

      <section className="card">
        <UserHistoryCharts
          user={{id: userId}}
          onBack={() => navigate('/users')}
        />
      </section>
    </>
  )
}

export default function App() {
  return (
    <div className="page">
      <Routes>
        <Route path="/" element={<Navigate to="/tags" replace />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/tags" replace />} />
      </Routes>
    </div>
  )
}
