import React, {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {getAccessToken, setAccessToken} from '../lib/auth.js'

export default function AuthPage() {
  const nav = useNavigate()
  const [token, setToken] = useState('')

  useEffect(() => {
    // if already authed, go to default page
    const t = getAccessToken()
    if (t) nav('/tags', {replace: true})
  }, [nav])

  function save() {
    const t = String(token || '').trim()
    if (!t) return
    setAccessToken(t)
    nav('/tags', {replace: true})
  }

  return (
    <div className="authWrap">
      <div className="card authCard">
        <div className="card__header">
          <div className="card__title">Auth</div>
        </div>

        <div className="stack">
          <div className="field">
            <div className="label">Access token</div>

            <div className="row row--gap">
              <input
                style={{
                  height: "50px",
                  margin: "10px 0"
                }}
                className="input"
                placeholder="Paste access token here"
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </div>

            <div className="hint">
              Token is stored locally and sent as &nbsp; <code>{'Bearer ${token}'}</code> &nbsp; on every request.
            </div>
          </div>

          <button
            style={{
              height: "45px",
              margin: "10px 0",
              background: "#12a42d",
              color: "#ffffff"
            }}
            className="btn btn--primary"
            type="button"
            onClick={save}
            disabled={!token.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
