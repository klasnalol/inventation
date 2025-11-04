import React, { useEffect, useMemo, useState } from 'react'
import api from '../api'

function formatDateLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Analytics({ user }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
      setSummary(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get('/analytics/summary')
      .then(({ data }) => {
        if (!cancelled) {
          setSummary(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        const status = err?.response?.status
        if (status === 401) {
          setError('Your session expired. Please log in again to view analytics.')
        } else {
          setError('We hit a snag loading analytics. Try refreshing in a moment.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const chartBars = useMemo(() => {
    const points = summary?.daily_responses || []
    if (!points.length) return []
    const maxCount = Math.max(...points.map((item) => item.count || 0), 1)
    return points.map((item) => ({
      ...item,
      height: Math.round(((item.count || 0) / maxCount) * 100),
      label: formatDateLabel(item.date),
    }))
  }, [summary])

  const designHighlights = summary?.designs || []
  const totals = summary?.totals || {}
  const guestCount = totals.guests ?? 0
  const confirmedCount = totals.confirmed_guests ?? 0
  const confirmationRate = guestCount ? Math.round((confirmedCount / guestCount) * 100) : 0
  const averageRsvpRate = Math.round(((totals.average_rsvp_rate ?? 0) || 0) * 100)

  if (!user) {
    return (
      <section className="analytics-page">
        <div className="card">
          <h2>Analytics requires an account</h2>
          <p className="muted">Log in or create an account to see RSVP velocity, guest trends, and design performance.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="analytics-page">
      <header className="analytics-header">
        <div>
          <h1>Event analytics</h1>
          <p className="muted">Track RSVP momentum, check guest confirmations, and spot which designs resonate the most.</p>
        </div>
        <div className="analytics-window muted">
          Reporting window begins {summary?.window_start ? formatDateLabel(summary.window_start) : 'recently'}
        </div>
      </header>

      {loading && (
        <div className="card status-block" role="status">
          <p>Loading insights...</p>
        </div>
      )}

      {error && (
        <div className="card error-block" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="analytics-metrics">
            <article className="metric-card">
              <span className="metric-label">Saved designs</span>
              <strong className="metric-value">{totals.designs ?? 0}</strong>
              <span className="metric-footnote">Templates you've customized</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">RSVP responses</span>
              <strong className="metric-value">{totals.responses ?? 0}</strong>
              <span className="metric-footnote">Average RSVP rate {averageRsvpRate}%</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Guest list entries</span>
              <strong className="metric-value">{totals.guests ?? 0}</strong>
              <span className="metric-footnote">Tracked guests so far</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Confirmed attendance</span>
              <strong className="metric-value">{totals.confirmed_guests ?? 0}</strong>
              <span className="metric-footnote">
                {guestCount ? `${confirmationRate}% of guest list` : 'Awaiting confirmations'}
              </span>
            </article>
          </div>

          <div className="analytics-grid">
            <div className="card chart-card">
              <div className="card-header">
                <h3>RSVP momentum</h3>
                <span className="muted">Last 30 days</span>
              </div>
              {chartBars.length ? (
                <div className="chart-bars">
                  {chartBars.map((bar) => (
                    <div className="chart-bar" key={bar.date}>
                      <div className="chart-bar__track">
                        <div
                          className="chart-bar__fill"
                          style={{ height: `${Math.max(bar.height, 6)}%` }}
                          title={`${bar.count} responses on ${bar.label}`}
                        />
                      </div>
                      <span className="chart-bar__label">{bar.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted empty-state">No RSVP activity captured in the last month yet.</p>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Top-performing designs</h3>
                <span className="muted">
                  {designHighlights.length ? 'Sorted by most recent' : 'Create a design to see performance'}
                </span>
              </div>
              {designHighlights.length ? (
                <ul className="design-performance-list">
                  {designHighlights.map((item) => (
                    <li key={item.id}>
                      <div>
                        <h4>{item.title}</h4>
                        <p className="muted">
                          {item.template?.name || 'Custom template'}
                          {item.template?.category ? ` - ${item.template.category}` : ''}
                        </p>
                      </div>
                      <div className="design-performance-metrics">
                        <span><strong>{item.responses}</strong> RSVPs</span>
                        <span><strong>{item.guests}</strong> guests</span>
                        <span>
                          <strong>{Math.round((item.rsvp_completion_rate || 0) * 100)}</strong>% RSVP rate
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted empty-state">Once guests respond, you will see which invitations resonate here.</p>
              )}
            </div>
          </div>

          <div className="card recent-activity-card">
            <div className="card-header">
              <h3>Latest RSVP messages</h3>
              <span className="muted">
                {summary?.recent_responses?.length ? 'Most recent 10 responses' : 'No RSVP responses yet'}
              </span>
            </div>
            {summary?.recent_responses?.length ? (
              <ul className="recent-response-list">
                {summary.recent_responses.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <p className="muted">{item.design_title}</p>
                    </div>
                    <div className="recent-response-meta">
                      <span>{formatTimestamp(item.created_at)}</span>
                      {item.message && <p className="muted message-snippet">{item.message}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted empty-state">Invite responses will flow in here and keep you on top of RSVP chatter.</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
