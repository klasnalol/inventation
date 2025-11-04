import React from 'react'
import { useI18n } from '../i18n'

export default function TemplateCard({ template, onPick }){
  const { t } = useI18n()
  const sizeLabel = `${template.width} x ${template.height}px`
  const categoryLabel = template.category ? t(template.category) : null
  const templateName = t(template.name)

  return (
    <article className="template-card">
      <div className="template-card__preview">
        <img src={template.thumbnail_url} alt={templateName} loading="lazy" />
        {categoryLabel && <span className="template-card__badge">{categoryLabel}</span>}
      </div>
      <div className="template-card__meta">
        <h3>{templateName}</h3>
        <p className="template-card__details">{sizeLabel}</p>
        <button className="primary" onClick={() => onPick(template)}>{t('Start designing')}</button>
      </div>
    </article>
  )
}
