import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api'
import CanvasEditor, { FABRIC_EXPORT_PROPS } from '../components/CanvasEditor'
import GuestList from '../components/GuestList'
import { useI18n } from '../i18n'

const TAB_INVITE = 'invite'
const TAB_RSVP = 'rsvp'

const SIZE_TOLERANCE = 4
const SIZE_VARIANTS = [
  { id: 'a6-portrait', name: 'A6 Portrait', width: 1200, height: 1800 },
  { id: 'a6-landscape', name: 'A6 Landscape', width: 1800, height: 1200 },
  { id: 'square', name: 'Square', width: 1600, height: 1600 },
  { id: 'postcard-5x7', name: 'Postcard 5x7', width: 1500, height: 2100 },
  { id: 'story-9x16', name: 'Story 9x16', width: 1080, height: 1920 },
  { id: 'wide-16x9', name: 'Cinema 16x9', width: 1920, height: 1080 },
]

const matchSizePreset = (width, height) => {
  if (!width || !height) return null
  return (
    SIZE_VARIANTS.find(
      (preset) =>
        Math.abs(preset.width - width) <= SIZE_TOLERANCE &&
        Math.abs(preset.height - height) <= SIZE_TOLERANCE
    ) || null
  )
}

const formatSizeLabel = (name, width, height, translate) =>
  `${translate(name, name)} - ${Math.round(width)} x ${Math.round(height)} px`

const extractFabricSize = (fabric) => {
  if (!fabric) return null
  const meta = fabric.meta || {}
  const width = meta.baseWidth || fabric.width || null
  const height = meta.baseHeight || fabric.height || null
  const sizeKey = meta.sizeKey || null
  return { width, height, sizeKey }
}

export default function Editor(){
  const { t } = useI18n()
  const [template, setTemplate] = useState(null)
  const [design, setDesign] = useState(null)
  const [designs, setDesigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState([])
  const [responsesLoading, setResponsesLoading] = useState(false)
  const [responsesError, setResponsesError] = useState(null)
  const [guests, setGuests] = useState([])
  const [guestsLoading, setGuestsLoading] = useState(false)
  const [guestsError, setGuestsError] = useState(null)
  const [copyStatus, setCopyStatus] = useState(null)
  const [activeTab, setActiveTab] = useState(TAB_INVITE)
  const [sizeKey, setSizeKey] = useState('template')
  const [customSize, setCustomSize] = useState(null)

  const inviteCanvasRef = useRef(null)
  const rsvpCanvasRef = useRef(null)

  const templateSize = useMemo(() => {
    if (!template?.width || !template?.height) return null
    return { width: template.width, height: template.height }
  }, [template?.width, template?.height])

  const sizeOptions = useMemo(() => {
    const options = []
    const addOption = (id, label, width, height, disabled = false) => {
      const exists = options.some(
        (opt) =>
          Math.abs(opt.width - width) <= SIZE_TOLERANCE &&
          Math.abs(opt.height - height) <= SIZE_TOLERANCE
      )
      if (!exists) {
        options.push({ id, label, width, height, disabled })
      }
    }

    if (templateSize) {
      addOption(
        'template',
        formatSizeLabel('Template default', templateSize.width, templateSize.height, t),
        templateSize.width,
        templateSize.height
      )
    }

    SIZE_VARIANTS.forEach((preset) => {
      addOption(
        preset.id,
        formatSizeLabel(preset.name, preset.width, preset.height, t),
        preset.width,
        preset.height
      )
    })

    if (customSize) {
      const exists = options.some(
        (opt) =>
          Math.abs(opt.width - customSize.width) <= SIZE_TOLERANCE &&
          Math.abs(opt.height - customSize.height) <= SIZE_TOLERANCE
      )
      if (!exists) {
        options.push({
          id: 'custom',
          label: formatSizeLabel('Custom', customSize.width, customSize.height, t),
          width: customSize.width,
          height: customSize.height,
          disabled: true,
        })
      }
    }

    return options
  }, [templateSize, customSize])

  const currentSize = useMemo(() => {
    if (sizeKey === 'template' || !sizeKey) {
      return templateSize || { width: 1200, height: 1800 }
    }
    if (sizeKey === 'custom' && customSize) {
      return customSize
    }
    const preset = SIZE_VARIANTS.find((variant) => variant.id === sizeKey)
    if (preset) {
      return { width: preset.width, height: preset.height }
    }
    if (templateSize) return templateSize
    if (customSize) return customSize
    return { width: 1200, height: 1800 }
  }, [sizeKey, templateSize, customSize])

  const handleSizeChange = useCallback((value) => {
    if (value === 'template') {
      setSizeKey('template')
      setCustomSize(null)
      return
    }
    if (value === 'custom') {
      if (customSize) setSizeKey('custom')
      return
    }
    const preset = SIZE_VARIANTS.find((variant) => variant.id === value)
    if (preset) {
      setSizeKey(value)
      setCustomSize(null)
    }
  }, [customSize])

  useEffect(() => {
    const storedTemplate = localStorage.getItem('currentTemplate')
    if (storedTemplate) setTemplate(JSON.parse(storedTemplate))
    api.get('/designs')
      .then(({ data }) => setDesigns(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!design?.id) {
      setGuests([])
    }
  }, [design?.id])

  useEffect(() => {
    if (!templateSize) return
    if (design?.fabric_json) return
    const preset = matchSizePreset(templateSize.width, templateSize.height)
    if (preset) {
      setSizeKey(preset.id)
      setCustomSize(null)
    } else {
      setSizeKey('template')
      setCustomSize(null)
    }
  }, [templateSize?.width, templateSize?.height, design?.fabric_json])

  const serializeCanvas = useCallback((canvas) => {
    if (!canvas) return null
    try {
      const json = canvas.toJSON(FABRIC_EXPORT_PROPS)
      if (currentSize?.width && currentSize?.height) {
        json.width = currentSize.width
        json.height = currentSize.height
        json.meta = {
          ...(json.meta || {}),
          baseWidth: currentSize.width,
          baseHeight: currentSize.height,
          sizeKey,
        }
      }
      return json
    } catch (err) {
      console.error(err)
      return null
    }
  }, [currentSize?.width, currentSize?.height, sizeKey])

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

  const fetchGuests = useCallback(async (designId) => {
    if (!designId) return
    setGuestsLoading(true)
    setGuestsError(null)
    try {
      const { data } = await api.get(`/designs/${designId}/guests`)
      setGuests(data)
    } catch (err) {
      setGuestsError('Unable to load guests right now.')
    } finally {
      setGuestsLoading(false)
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
    if (designId) {
      fetchResponses(designId)
      fetchGuests(designId)
    }
  }, [design, fetchGuests, fetchResponses, refreshDesignList, serializeCanvas, template])

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
    if (designId) {
      fetchResponses(designId)
      fetchGuests(designId)
    }
  }, [design, fetchGuests, fetchResponses, refreshDesignList, serializeCanvas, template])

  const loadDesign = useCallback(async (id) => {
    const { data } = await api.get(`/designs/${id}`)
    setDesign(data)
    await ensureTemplateLoaded(data.template_id)
    fetchResponses(id)
    fetchGuests(id)
  }, [ensureTemplateLoaded, fetchGuests, fetchResponses])

  const handleGuestCreate = useCallback(async (payload) => {
    if (!design?.id) throw new Error('Save your design before adding guests.')
    const { data } = await api.post(`/designs/${design.id}/guests`, payload)
    setGuests((prev) => [...prev, data])
    return data
  }, [design?.id])

  const handleGuestUpdate = useCallback(async (guestId, updates) => {
    const { data } = await api.patch(`/guests/${guestId}`, updates)
    setGuests((prev) => prev.map((guest) => (guest.id === guestId ? data : guest)))
    return data
  }, [])

  const handleGuestDelete = useCallback(async (guestId) => {
    await api.delete(`/guests/${guestId}`)
    setGuests((prev) => prev.filter((guest) => guest.id !== guestId))
  }, [])

  useEffect(() => {
    if (design?.id) {
      fetchResponses(design.id)
    } else {
      setResponses([])
    }
  }, [design?.id, fetchResponses])

  useEffect(() => {
    if (!design?.fabric_json && !design?.rsvp_fabric_json) return
    const primary = extractFabricSize(design?.fabric_json)
    const backup = extractFabricSize(design?.rsvp_fabric_json)
    const source = primary || backup
    if (!source) return
    const { width, height, sizeKey: savedKey } = source
    if (savedKey) {
      if (savedKey === 'custom' && width && height) {
        setSizeKey('custom')
        setCustomSize({ width, height })
        return
      }
      const preset = SIZE_VARIANTS.find((variant) => variant.id === savedKey)
      if (preset) {
        setSizeKey(savedKey)
        setCustomSize(null)
        return
      }
    }
    if (width && height) {
      const preset = matchSizePreset(width, height)
      if (preset) {
        setSizeKey(preset.id)
        setCustomSize(null)
      } else {
        setSizeKey('custom')
        setCustomSize({ width, height })
      }
    }
  }, [design?.id, design?.fabric_json, design?.rsvp_fabric_json])

  const copyInviteLink = useCallback(() => {
    if (!design?.id || typeof window === 'undefined') return
    const link = `${window.location.origin}/rsvp/${design.id}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(() => {
          setCopyStatus(t('Copied!'))
          setTimeout(() => setCopyStatus(null), 2000)
        })
        .catch(() => setCopyStatus(t('Copy failed')))
    } else {
      setCopyStatus(t('Copy not supported'))
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
          <h2>{t('Select a template to get started')}</h2>
          <p>{t('Head back to the template gallery to choose a design. Your picks automatically appear here.')}</p>
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
            {t('Invitation design')}
          </button>
          <button
            type="button"
            className={activeTab === TAB_RSVP ? 'active' : ''}
            onClick={() => setActiveTab(TAB_RSVP)}
          >
            {t('RSVP page')}
          </button>
        </div>
        <div className={`canvas-pane ${activeTab === TAB_INVITE ? 'active' : 'hidden'}`}>
          <CanvasEditor
            template={template}
            design={design}
            onSave={handleInviteSave}
            defaultTitleSuffix="My Invite"
            sizeOptions={sizeOptions}
            sizeKey={sizeKey}
            sizeDimensions={currentSize}
            onSizeChange={handleSizeChange}
            allowSizeChange
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
            sizeOptions={sizeOptions}
            sizeKey={sizeKey}
            sizeDimensions={currentSize}
            allowSizeChange={false}
            onCanvasReady={(canvas) => {
              rsvpCanvasRef.current = canvas
            }}
          />
        </div>
      </div>
      <aside className="editor-sidebar">
        <div className="card">
          <h3>{t('Your saved designs')}</h3>
          {loading && <p className="muted">{t('Loading designs...')}</p>}
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
          {!loading && !designs.length && <p className="muted">{t("You haven't saved any designs yet.")}</p>}
        </div>
        {design?.id && (
          <div className="card responses-card">
            <h3>{t('Guest responses')}</h3>
            <p className="muted">{t('Share the RSVP link so guests can leave their details.')}</p>
            <div className="invite-link">
              <code>{inviteLink}</code>
              <button className="ghost" onClick={copyInviteLink}>{t('Copy link')}</button>
            </div>
            {copyStatus && <p className="status small">{copyStatus}</p>}
            <div className="responses-list">
              {responsesLoading && <p className="muted">{t('Loading responses...')}</p>}
              {responsesError && <p className="error">{responsesError}</p>}
              {!responsesLoading && !responsesError && !responses.length && (
                <p className="muted">{t('No one has responded yet.')}</p>
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
              {t('Refresh responses')}
            </button>
          </div>
        )}
        {design?.id && (
          <GuestList
            designId={design.id}
            guests={guests}
            loading={guestsLoading}
            error={guestsError}
            onRefresh={() => fetchGuests(design.id)}
            onCreate={handleGuestCreate}
            onUpdate={handleGuestUpdate}
            onDelete={handleGuestDelete}
          />
        )}
      </aside>
    </div>
  )
}
