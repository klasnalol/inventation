import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import Editor from './pages/Editor'
import TemplateGallery from './components/TemplateGallery'
import Rsvp from './pages/Rsvp'
import { setToken } from './api'

export default function App(){
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const saved = localStorage.getItem('auth')
    if (saved){
      const { token, user } = JSON.parse(saved)
      setUser(user)
      setToken(token)
    }
  }, [])

  function handleLogout(){
    localStorage.removeItem('auth')
    setUser(null)
    setToken(null)
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/">Invent Invitations</Link>
        <nav className="nav-links">
          <Link to="/">Templates</Link>
          {user && <Link to="/editor">Editor</Link>}
        </nav>
        <div className="auth-area">
          {user ? (
            <>
              <span className="user-email">{user.email}</span>
              <button className="secondary" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <Link className="login-link" to="/login">Login / Register</Link>
          )}
        </div>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<TemplateGallery user={user} />} />
          <Route
            path="/login"
            element={(
              <Login
                onAuth={({ token, user }) => {
                  localStorage.setItem('auth', JSON.stringify({ token, user }))
                  setUser(user)
                  setToken(token)
                  navigate('/')
                }}
              />
            )}
          />
          <Route path="/editor" element={<Editor />} />
          <Route path="/rsvp/:designId" element={<Rsvp />} />
        </Routes>
      </main>
    </div>
  )
}
