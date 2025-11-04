import React, { useEffect, useState } from 'react'
import api from '../api'
import TemplateCard from './TemplateCard'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'

export default function TemplateGallery({ user }){
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState('')
  const navigate = useNavigate()
  const { t } = useI18n()

  useEffect(()=>{
    let cancelled = false
    setLoading(true)
    api.get('/templates')
      .then(r => {
        if (!cancelled){
          setTemplates(r.data)
          setErrorKey('')
        }
      })
      .catch(()=>{
        if (!cancelled){
          setErrorKey('We could not load templates right now. Please try again shortly.')
        }
      })
      .finally(()=>!cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  function pick(templateData){
    localStorage.setItem('currentTemplate', JSON.stringify(templateData))
    navigate('/editor')
  }

  return (
    <section className="template-gallery">
      <div className="section-heading">
        <h1>{t('Design invitations that set the tone')}</h1>
        <p>{t('Explore editorial-style templates curated with vibrant photography. Personalize every detail and share a stunning invite in minutes.')}</p>
      </div>

      {loading && (
        <div className="loading-state" role="status">{t('Loading templates...')}</div>
      )}
      {errorKey && (
        <div className="error-state" role="alert">{t(errorKey)}</div>
      )}

      <div className="template-grid">
        {templates.map((tpl) => (
          <TemplateCard key={tpl.id} template={tpl} onPick={pick} />
        ))}
      </div>

      {!loading && !templates.length && !errorKey && (
        <p className="empty-state">{t('No templates are available just yet - check back soon!')}</p>
      )}

      {!user && (
        <p className="login-tip">
          <strong>{t('Tip:')}</strong> {t('Log in to upload photos and save every version of your design.')}
        </p>
      )}
    </section>
  )
}
