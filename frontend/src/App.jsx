import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import Editor from './pages/Editor'
import TemplateGallery from './components/TemplateGallery'
import Rsvp from './pages/Rsvp'
import Analytics from './pages/Analytics'
import { useI18n } from './i18n'
import { setToken } from './api'

export default function App(){
  const [user, setUser] = useState(null)
  const navigate = useNavigate()
  const { t, language, setLanguage, languages } = useI18n()

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

  function handleLanguageChange(event){
    setLanguage(event.target.value)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand" to="/">{t('Qonaq Invite')}</Link>
          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {t('Templates')}
            </NavLink>
            {user && (
              <>
                <NavLink to="/editor" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  {t('Editor')}
                </NavLink>
                <NavLink to="/analytics" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  {t('Analytics')}
                </NavLink>
              </>
            )}
          </nav>
          <div className="language-switcher">
            <select value={language} onChange={handleLanguageChange} aria-label={t('Language')}>
              {languages.map((option) => (
                <option key={option.code} value={option.code}>
                  {t(option.label, option.label)}
                </option>
              ))}
            </select>
          </div>
          <div className="auth-area">
            {user ? (
              <>
                <span className="user-email">{user.email}</span>
                <button className="secondary" onClick={handleLogout}>{t('Logout')}</button>
              </>
            ) : (
              <Link className="login-link" to="/login">{t('Login / Register')}</Link>
            )}
          </div>
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
          <Route path="/analytics" element={<Analytics user={user} />} />
        </Routes>
      </main>
    </div>
  )
}
