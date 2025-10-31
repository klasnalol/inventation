import React from 'react'

export default function TemplateCard({ t, onPick }){
  return (
    <article className="template-card">
      <div className="template-card__preview">
        <img src={t.thumbnail_url} alt={t.name} loading="lazy" />
      </div>
      <div className="template-card__meta">
        <div>
          <h3>{t.name}</h3>
          {t.category && <p className="template-card__category">{t.category}</p>}
        </div>
        <button className="primary" onClick={() => onPick(t)}>Use</button>
      </div>
    </article>
  )
}
