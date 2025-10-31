import React, { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api'
import CanvasEditor, { FABRIC_EXPORT_PROPS } from '../components/CanvasEditor'

const TAB_INVITE = 'invite'
const TAB_RSVP = 'rsvp'

export default function Editor(){
  const [template, setTemplate] = useState(null)
  const [design, setDesign] = useState(null)
  const [designs, setDesigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState([])
  const [responsesLoading, setResponsesLoading] = useState(false)
  const [responsesError, setResponsesError] = useState(null)
  const [copyStatus, setCopyStatus] = useState(null)
  const [activeTab, setActiveTab] = useState(TAB_INVITE)

  const inviteCanvasRef = useRef(null)
  const rsvpCanvasRef = useRef(null)

  useEffect(() => {
    const storedTemplate = localStorage.getItem('currentTemplate')
    if (storedTemplate) setTemplate(JSON.parse(storedTemplate))
    api.get('/designs')
      .then(({ data }) => setDesigns(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const serializeCanvas = useCallback((canvas) => {
    if (!canvas) return null
    try {
      return canvas.toJSON(FABRIC_EXPORT_PROPS)
    } catch (err) {
      console.error(err)
      return null
    }
  }, [])

  const fetchResponses = useCallback(async (designId) => {
    if (!designId) return
    setResponsesLoading(true)
    setResponsesError(null)
    try {
      const { data } = await api.get(`/designs/${designId}/responses`)
      setResponses(data)
    } catch (err) {
      setResponsesError('Unable to load responses right now.')
    } finally {
      setResponsesLoading(false)
    }
  }, [])

  const refreshDesignList = useCallback(async () => {
    const { data } = await api.get('/designs')
    setDesigns(data)
  }, [])

  const ensureTemplateLoaded = useCallback(async (templateId) => {
    if (template && template.id === templateId) return
    const { data } = await api.get('/templates')
    const found = data.find((item) => item.id === templateId)
    if (found) setTemplate(found)
  }, [template])

  const handleInviteSave = useCallback(async (payload) => {
    if (!template) return
    let designId = design?.id || null
    const rsvpJson =
      serializeCanvas(rsvpCanvasRef.current) ??
      design?.rsvp_fabric_json ??
      null

    if (designId) {
      await api.put(`/designs/${designId}`, {
        fabric_json: payload.fabric_json,
        rsvp_fabric_json: rsvpJson,
        title: payload.title,
      })
      setDesign((prev) =>
        prev
          ? {
              ...prev,
              title: payload.title,
              fabric_json: payload.fabric_json,
              rsvp_fabric_json: rsvpJson ?? prev.rsvp_fabric_json,
            }
          : prev
      )
    } else {
      const body = {
        title: payload.title,
        template_id: template.id,
        fabric_json: payload.fabric_json,
        rsvp_fabric_json: rsvpJson,
      }
      const { data } = await api.post('/designs', body)
      designId = data.id
      setDesign({
        id: designId,
        title: body.title,
        template_id: template.id,
        fabric_json: body.fabric_json,
        rsvp_fabric_json: body.rsvp_fabric_json,
      })
    }
    await refreshDesignList()
    if (designId) fetchResponses(designId)
  }, [design, fetchResponses, refreshDesignList, serializeCanvas, template])

  const handleRsvpSave = useCallback(async (payload) => {
    if (!template) return
    let designId = design?.id || null
    const inviteJson =
      serializeCanvas(inviteCanvasRef.current) ??
      design?.fabric_json ??
      payload.fabric_json

    if (designId) {
      await api.put(`/designs/${designId}`, {
        fabric_json: inviteJson,
        rsvp_fabric_json: payload.fabric_json,
        title: design?.title || payload.title,
      })
      setDesign((prev) =>
        prev
          ? {
              ...prev,
              fabric_json: inviteJson,
              rsvp_fabric_json: payload.fabric_json,
            }
          : prev
      )
    } else {
      const body = {
        title: payload.title,
        template_id: template.id,
        fabric_json: inviteJson,
        rsvp_fabric_json: payload.fabric_json,
      }
      const { data } = await api.post('/designs', body)
      designId = data.id
      setDesign({
        id: designId,
        title: body.title,
        template_id: template.id,
        fabric_json: body.fabric_json,
        rsvp_fabric_json: body.rsvp_fabric_json,
      })
    }
    await refreshDesignList()
    if (designId) fetchResponses(designId)
  }, [design, fetchResponses, refreshDesignList, serializeCanvas, template])

  const loadDesign = useCallback(async (id) => {
    const { data } = await api.get(`/designs/${id}`)
    setDesign(data)
    await ensureTemplateLoaded(data.template_id)
    fetchResponses(id)
  }, [ensureTemplateLoaded, fetchResponses])

  useEffect(() => {
    if (design?.id) {
      fetchResponses(design.id)
    } else {
      setResponses([])
    }
  }, [design?.id, fetchResponses])

  const copyInviteLink = useCallback(() => {
    if (!design?.id || typeof window === 'undefined') return
    const link = `${window.location.origin}/rsvp/${design.id}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(() => {
          setCopyStatus('Copied!')
          setTimeout(() => setCopyStatus(null), 2000)
        })
        .catch(() => setCopyStatus('Copy failed'))
    } else {
      setCopyStatus('Copy not supported')
    }
  }, [design?.id])

  const inviteLink =
    typeof window !== 'undefined' && design?.id
      ? `${window.location.origin}/rsvp/${design.id}`
      : ''

  if (!template) {
    return (
      <div className="editor-empty">
        <div className="card">
          <h2>Select a template to get started</h2>
          <p>Head back to the template gallery to choose a design. Your picks automatically appear here.</p>
        </div>
      </div>
    )
  }

  const rsvpDesign = design
    ? { ...design, fabric_json: design.rsvp_fabric_json }
    : null

  return (
    <div className="editor-layout">
      <div className="editor-canvas">
        <div className="editor-tabs">
          <button
            type="button"
            className={activeTab === TAB_INVITE ? 'active' : ''}
            onClick={() => setActiveTab(TAB_INVITE)}
          >
            Invitation design
          </button>
          <button
            type="button"
            className={activeTab === TAB_RSVP ? 'active' : ''}
            onClick={() => setActiveTab(TAB_RSVP)}
          >
            RSVP page
          </button>
        </div>
        <div className={`canvas-pane ${activeTab === TAB_INVITE ? 'active' : 'hidden'}`}>
          <CanvasEditor
            template={template}
            design={design}
            onSave={handleInviteSave}
            defaultTitleSuffix="My Invite"
            onCanvasReady={(canvas) => {
              inviteCanvasRef.current = canvas
            }}
          />
        </div>
        <div className={`canvas-pane ${activeTab === TAB_RSVP ? 'active' : 'hidden'}`}>
          <CanvasEditor
            template={template}
            design={rsvpDesign}
            onSave={handleRsvpSave}
            defaultText="Tell us if you can make it!"
            defaultTitleSuffix="RSVP Page"
            onCanvasReady={(canvas) => {
              rsvpCanvasRef.current = canvas
            }}
          />
        </div>
      </div>
      <aside className="editor-sidebar">
        <div className="card">
          <h3>Your saved designs</h3>
          {loading && <p className="muted">Loading designs...</p>}
          <ul className="design-list">
            {designs.map((d) => (
              <li key={d.id}>
                <button onClick={() => loadDesign(d.id)}>
                  <span>{d.title}</span>
                  <small>
                    #{d.id}
                    {d.has_rsvp_design ? ' - RSVP' : ''}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {!loading && !designs.length && <p className="muted">You haven't saved any designs yet.</p>}
        </div>
        {design?.id && (
          <div className="card responses-card">
            <h3>Guest responses</h3>
            <p className="muted">Share the RSVP link so guests can leave their details.</p>
            <div className="invite-link">
              <code>{inviteLink}</code>
              <button className="ghost" onClick={copyInviteLink}>Copy link</button>
            </div>
            {copyStatus && <p className="status small">{copyStatus}</p>}
            <div className="responses-list">
              {responsesLoading && <p className="muted">Loading responses...</p>}
              {responsesError && <p className="error">{responsesError}</p>}
              {!responsesLoading && !responsesError && !responses.length && (
                <p className="muted">No one has responded yet.</p>
              )}
              <ul>
                {responses.map((r) => (
                  <li key={r.id}>
                    <strong>{r.name}</strong>
                    <span>{r.phone}</span>
                    {r.message && <p className="muted response-message">{r.message}</p>}
                  </li>
                ))}
              </ul>
            </div>
            <button className="secondary" onClick={() => fetchResponses(design.id)} disabled={responsesLoading}>
              Refresh responses
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}
