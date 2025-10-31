import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fabric } from 'fabric'
import api from '../api'

export default function Rsvp(){
  const { designId } = useParams()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [designInfo, setDesignInfo] = useState(null)
  const [infoError, setInfoError] = useState(null)
  const previewRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let ignore = false
    api.get(`/rsvp/${designId}`)
      .then(({ data }) => { if (!ignore) setDesignInfo(data) })
      .catch(() => { if (!ignore) setInfoError('We could not find this invitation.') })
    return () => { ignore = true }
  }, [designId])

  useEffect(() => {
    if (!previewRef.current) return
    const canvasEl = previewRef.current
    const renderJson = designInfo?.rsvp_fabric_json || designInfo?.fabric_json
    if (!renderJson) {
      if (canvasRef.current) {
        canvasRef.current.dispose()
        canvasRef.current = null
      }
      return
    }

    const width = designInfo?.template_width || 900
    const height = designInfo?.template_height || 1200
    canvasEl.width = width
    canvasEl.height = height

    const c = new fabric.StaticCanvas(canvasEl, { preserveObjectStacking: true })
    canvasRef.current = c
    c.loadFromJSON(renderJson, () => {
      c.renderAll()
      c.discardActiveObject()
    }, (o, object) => {
      if (object) {
        object.set({ selectable: false, evented: false })
      }
    })

    return () => {
      c.dispose()
      canvasRef.current = null
    }
  }, [designInfo?.fabric_json, designInfo?.rsvp_fabric_json, designInfo?.template_height, designInfo?.template_width])

  async function submit(e){
    e.preventDefault()
    setStatus(null)
    if (!name.trim() || !phone.trim()){
      setStatus({ type: 'error', message: 'Please provide both your name and phone number.' })
      return
    }
    setSubmitting(true)
    try{
      await api.post(`/rsvp/${designId}`, { name: name.trim(), phone: phone.trim(), message: message.trim() })
      setName('')
      setPhone('')
      setMessage('')
      setStatus({ type: 'success', message: 'Thanks! Your response has been recorded.' })
    }catch(err){
      const errorMessage = err.response?.data?.error || 'Something went wrong. Please try again.'
      setStatus({ type: 'error', message: errorMessage })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rsvp-page">
      {designInfo?.rsvp_fabric_json || designInfo?.fabric_json ? (
        <div className="rsvp-preview">
          <canvas ref={previewRef} />
        </div>
      ) : null}
      <div className="card">
        <h1>{designInfo?.title || 'RSVP'}</h1>
        {designInfo?.template && <p className="muted">Invitation: {designInfo.template}</p>}
        {infoError && <p className="error">{infoError}</p>}
        {!infoError && (
          <form onSubmit={submit} className="rsvp-form">
            <label>
              <span>Your name</span>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Jane Doe" />
            </label>
            <label>
              <span>Phone number</span>
              <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </label>
            <label>
              <span>Message for the hosts</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Let us know about any guests or special requests."
                rows={4}
              />
            </label>
            {status && <p className={status.type === 'error' ? 'error' : 'success'}>{status.message}</p>}
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending...' : 'Submit RSVP'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
