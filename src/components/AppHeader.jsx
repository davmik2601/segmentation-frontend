import React from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {clearAccessToken} from '../lib/auth.js'

export default function AppHeader() {
  const nav = useNavigate()
  const loc = useLocation()

  function logout() {
    clearAccessToken()
    nav('/auth', {replace: true})
  }

  function isActive(path) {
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }

  return (
    <div className="topbar">
      <div className="topbar__actions">
        <div>
          <div className="brand__title">Admin</div>
          <div className="brand__subtitle">User segmentation</div>
        </div>

        <div className="nav">
          <button
            className={`nav__btn ${isActive('/segments') ? 'is-active' : ''}`}
            onClick={() => nav('/segments')}
          >
            Segments
          </button>

          <button
            className={`nav__btn ${isActive('/tags') ? 'is-active' : ''}`}
            onClick={() => nav('/tags')}
          >
            Tags
          </button>

          <button
            className={`nav__btn ${isActive('/users') ? 'is-active' : ''}`}
            onClick={() => nav('/users')}
          >
            Users
          </button>
        </div>

        <button className="btn btn--danger" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  )
}
