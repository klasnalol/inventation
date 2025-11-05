import React, { useState } from 'react'
import api from '../api'

export default function Login({ onAuth }){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e){
    e.preventDefault()
    setError('')
    setBusy(true)
    try{
      const { data } = await api.post(`/auth/${mode}`, { email, password })
      onAuth(data)
    }catch(err){
      setError(err.response?.data?.error || 'We could not sign you in. Please check your details and try again.')
    }finally{
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="card-subtitle">
          {mode === 'login'
            ? 'Sign in to access your saved designs and keep editing.'
            : 'Join Qonaq Invite to save your invites and collaborate anywhere.'}
        </p>
        <label>
          <span>Email</span>
          <input
            required
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            required
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
          disabled={busy}
        >
          {mode === 'login' ? 'Need an account? Register now.' : 'Have an account? Log in instead.'}
        </button>
      </form>
    </div>
  )
}
