import React from 'react'
import {useNavigate} from 'react-router-dom'
import {clearAccessToken} from '../lib/auth.js'

export default function AppHeader() {
  const nav = useNavigate()

  function logout() {
    clearAccessToken()
    nav('/auth', {replace: true})
  }

  return (
    <div className="topbar">
      <div className="topbar__actions">
        <button
          className="btn btn--danger"
          onClick={logout}
        >
          Logout
        </button>
      </div>

      <div>
        <div className="brand__title">Admin</div>
        <div className="brand__subtitle">User segmentation</div>
      </div>
    </div>
  )
}
