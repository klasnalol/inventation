import React, { useEffect, useState } from 'react'
import api from '../api'
import TemplateCard from './TemplateCard'
import { useNavigate } from 'react-router-dom'

export default function TemplateGallery({ user }){
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(()=>{
    let cancelled = false
    setLoading(true)
    api.get('/templates')
      .then(r => {
        if (!cancelled){
          setTemplates(r.data)
          setError('')
        }
      })
      .catch(()=>{
        if (!cancelled){
          setError('We could not load templates right now. Please try again shortly.')
        }
      })
      .finally(()=>!cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  function pick(t){
    localStorage.setItem('currentTemplate', JSON.stringify(t))
    navigate('/editor')
  }

  return (
    <section className="template-gallery">
      <div className="section-heading">
        <h1>Design an unforgettable invitation</h1>
        <p>Create polished invites in minutes. Choose a template, customize it, and share it instantly.</p>
      </div>

      {loading && (
        <div className="loading-state" role="status">Loading templates…</div>
      )}
      {error && (
        <div className="error-state" role="alert">{error}</div>
      )}

      <div className="template-grid">
        {templates.map(t => <TemplateCard key={t.id} t={t} onPick={pick} />)}
      </div>

      {!loading && !templates.length && !error && (
        <p className="empty-state">No templates are available just yet—check back soon!</p>
      )}

      {!user && (
        <p className="login-tip">
          <strong>Tip:</strong> Log in to upload photos and save every version of your design.
        </p>
      )}
    </section>
  )
}
