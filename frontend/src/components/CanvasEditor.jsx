import React, { useCallback, useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'
import api from '../api'

export const FABRIC_EXPORT_PROPS = [
  'selectable',
  'evented',
  'layerId',
  'layerName',
  'layerType',
  'backgroundTag',
]

function resolveImageSrc(img) {
  if (!img) return null
  if (typeof img.getSrc === 'function') return img.getSrc()
  if (img._originalElement?.currentSrc) return img._originalElement.currentSrc
  if (img._element?.currentSrc) return img._element.currentSrc
  if (img._originalElement?.src) return img._originalElement.src
  if (img._element?.src) return img._element.src
  return img.src || null
}

function loadFabricImage(src, options) {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      src,
      (img, isError) => {
        if (!img) {
          reject(isError || new Error('Unable to load image'))
          return
        }
        resolve(img)
      },
      options
    )
  })
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function isCanvasReady(instance) {
  return !!(instance && instance.lowerCanvasEl && instance.contextContainer)
}

const DEFAULT_TEXT = 'You are invited!'
const DEFAULT_BG = '#ffffff'

export default function CanvasEditor({
  template,
  design,
  onSave,
  defaultText = DEFAULT_TEXT,
  defaultTitleSuffix = 'My Invite',
  onCanvasReady,
}){
  const canvasRef = useRef(null)
  const [canvas, setCanvas] = useState(null)
  const [busy, setBusy] = useState(false)
  const [layers, setLayers] = useState([])
  const [activeLayer, setActiveLayer] = useState(null)
  const [background, setBackground] = useState(DEFAULT_BG)
  const [hasCustomBackground, setHasCustomBackground] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const c = new fabric.Canvas(canvasRef.current, { preserveObjectStacking: true })
    setCanvas(c)
    if (onCanvasReady) onCanvasReady(c)
    return () => {
      if (onCanvasReady) onCanvasReady(null)
      c.dispose()
    }
  }, [onCanvasReady])

  const ensureMetadata = useCallback((obj) => {
    if (!obj) return
    if (!obj.layerId) {
      obj.set('layerId', `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
    }
    if (!obj.layerType) {
      obj.set('layerType', obj.type === 'textbox' ? 'text' : 'image')
    }
    if (!obj.layerName) {
      obj.set('layerName', obj.layerType === 'text' ? 'Text Layer' : 'Image Layer')
    }
  }, [])

  const refreshLayers = useCallback(() => {
    if (!canvas) return
    const active = canvas.getActiveObject()
    const objects = canvas
      .getObjects()
      .filter((obj) => obj && obj !== canvas.backgroundImage)
      .map((obj, index) => ({
        id: obj.layerId,
        name: obj.layerName || (obj.layerType === 'text' ? 'Text Layer' : 'Image Layer'),
        type: obj.layerType || (obj.type === 'textbox' ? 'text' : obj.type),
        visible: obj.visible !== false,
        index,
      }))
      .reverse()
    setLayers(objects)
    setActiveLayer(active && active !== canvas.backgroundImage ? active.layerId : null)
  }, [canvas])

  useEffect(() => {
    if (!canvas) return

    const handleAdd = (e) => {
      if (!e.target || e.target === canvas.backgroundImage) return
      ensureMetadata(e.target)
      refreshLayers()
    }
    const handleRemove = (e) => {
      if (!e.target || e.target === canvas.backgroundImage) return
      refreshLayers()
    }
    const handleUpdate = () => refreshLayers()

    canvas.on('object:added', handleAdd)
    canvas.on('object:removed', handleRemove)
    canvas.on('object:modified', handleUpdate)
    canvas.on('selection:created', handleUpdate)
    canvas.on('selection:updated', handleUpdate)
    canvas.on('selection:cleared', handleUpdate)

    return () => {
      canvas.off('object:added', handleAdd)
      canvas.off('object:removed', handleRemove)
      canvas.off('object:modified', handleUpdate)
      canvas.off('selection:created', handleUpdate)
      canvas.off('selection:updated', handleUpdate)
      canvas.off('selection:cleared', handleUpdate)
    }
  }, [canvas, ensureMetadata, refreshLayers])

  const addOverlayImageToCanvas = useCallback((img) => {
    if (!canvas || !img || !isCanvasReady(canvas)) return
    const width = canvas.getWidth()
    const height = canvas.getHeight()
    if (width && height && img.width && img.height) {
      const maxWidth = width * 0.6
      const maxHeight = height * 0.6
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1)
      img.scale(scale)
      img.set({
        left: (width - img.getScaledWidth()) / 2,
        top: (height - img.getScaledHeight()) / 2,
      })
    } else {
      img.set({ left: 80, top: 120, scaleX: 0.5, scaleY: 0.5 })
    }
    ensureMetadata(img)
    canvas.add(img)
    canvas.setActiveObject(img)
    canvas.renderAll()
  }, [canvas, ensureMetadata])

  const applyBackgroundFromSource = useCallback(
    async (source, tag = 'custom', options = {}) => {
      if (!canvas || !source || !isCanvasReady(canvas)) throw new Error('Missing canvas or image source')
      const targetCanvas = canvas
      const img = await loadFabricImage(source, options)
      if (!targetCanvas || targetCanvas !== canvas || !isCanvasReady(targetCanvas)) return null
      const width = targetCanvas.getWidth()
      const height = targetCanvas.getHeight()
      if (width && height && img.width && img.height) {
        const scale = Math.max(width / img.width, height / img.height)
        img.scale(scale)
        img.set({
          left: (width - img.getScaledWidth()) / 2,
          top: (height - img.getScaledHeight()) / 2,
        })
      } else if (width) {
        img.scaleToWidth(width)
      }
      img.set({
        selectable: false,
        evented: false,
        originX: 'left',
        originY: 'top',
        backgroundTag: tag,
      })
      await new Promise((resolve) => {
        if (!isCanvasReady(targetCanvas)) {
          resolve()
          return
        }
        targetCanvas.setBackgroundImage(img, () => {
          if (isCanvasReady(targetCanvas)) {
            targetCanvas.renderAll()
          }
          resolve()
        })
      })
      setHasCustomBackground(tag === 'custom')
      return img
    },
    [canvas, setHasCustomBackground]
  )

  useEffect(() => {
    if (!canvas || !template || !isCanvasReady(canvas)) return

    canvas.clear()
    setError(null)

    const bootstrap = async () => {
      if (!canvas || !isCanvasReady(canvas)) return
      const instance = canvas
      instance.setWidth(template.width)
      instance.setHeight(template.height)
      try {
        await applyBackgroundFromSource(template.image_url, 'template', { crossOrigin: 'anonymous' })
      } catch (err) {
        console.error(err)
        if (isCanvasReady(instance)) {
          instance.setBackgroundColor(DEFAULT_BG, instance.renderAll.bind(instance))
        }
        setHasCustomBackground(false)
      }
      if (!isCanvasReady(instance)) return
      if (design?.fabric_json) {
        instance.loadFromJSON(design.fabric_json, () => {
          if (!isCanvasReady(instance)) return
          instance.renderAll()
          const color = instance.backgroundColor || DEFAULT_BG
          if (!instance.backgroundColor) {
            instance.setBackgroundColor(color, instance.renderAll.bind(instance))
          }
          setBackground(color)
          const bgImage = instance.backgroundImage
          if (bgImage) {
            if (bgImage.backgroundTag) {
              setHasCustomBackground(bgImage.backgroundTag === 'custom')
            } else {
              const src = resolveImageSrc(bgImage)
              setHasCustomBackground(
                !!src && !!template?.image_url && src !== template.image_url
              )
            }
          } else {
            setHasCustomBackground(false)
          }
          refreshLayers()
        })
      } else {
        const t = new fabric.Textbox(defaultText, {
          left: template.width * 0.1,
          top: template.height * 0.1,
          width: template.width * 0.8,
          fontSize: Math.round(template.width * 0.06),
          fill: '#111',
          textAlign: 'center',
          fontFamily: 'Georgia, serif',
        })
        ensureMetadata(t)
        if (!isCanvasReady(instance)) return
        instance.add(t)
        instance.setBackgroundColor(DEFAULT_BG, instance.renderAll.bind(instance))
        setBackground(DEFAULT_BG)
        setHasCustomBackground(false)
      }
    }

    bootstrap()
  }, [canvas, template, design, ensureMetadata, refreshLayers, applyBackgroundFromSource])

  const findLayerObject = useCallback(
    (layerId) => {
      if (!canvas) return null
      return canvas.getObjects().find((obj) => obj.layerId === layerId) || null
    },
    [canvas]
  )

  function addText() {
    if (!canvas) return
    const t = new fabric.Textbox('Double-click to edit', {
      left: 60,
      top: 60,
      width: 400,
      fontSize: 42,
      fill: '#222',
    })
    ensureMetadata(t)
    canvas.add(t)
    canvas.setActiveObject(t)
    canvas.renderAll()
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0]
    if (!file || !canvas || !isCanvasReady(canvas)) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const img = await loadFabricImage(data.url, { crossOrigin: 'anonymous' })
      addOverlayImageToCanvas(img)
      setError(null)
    } catch (err) {
      console.error(err)
      try {
        const dataUrl = await readFileAsDataURL(file)
        const img = await loadFabricImage(dataUrl)
        addOverlayImageToCanvas(img)
        const needsAuth = err?.response?.status === 401
        setError(
          needsAuth
            ? 'Login required to upload to the server. Used a local copy instead.'
            : 'Upload failed - used a local copy instead.'
        )
      } catch (fallbackErr) {
        console.error(fallbackErr)
        setError('Unable to load that image. Please try a different file.')
      }
    } finally {
      setBusy(false)
      if (e.target) e.target.value = ''
    }
  }

  async function uploadBackgroundImage(e) {
    const file = e.target.files?.[0]
    if (!file || !canvas || !isCanvasReady(canvas)) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await applyBackgroundFromSource(data.url, 'custom', { crossOrigin: 'anonymous' })
      setError(null)
    } catch (err) {
      console.error(err)
      try {
        const dataUrl = await readFileAsDataURL(file)
        await applyBackgroundFromSource(dataUrl, 'custom')
        const needsAuth = err?.response?.status === 401
        setError(
          needsAuth
            ? 'Login required to upload backgrounds. Using a local background instead.'
            : 'Background upload failed - using a local background instead.'
        )
      } catch (fallbackErr) {
        console.error(fallbackErr)
        setError('Unable to load that background. Please try another image.')
      }
    } finally {
      setBusy(false)
      if (e.target) e.target.value = ''
    }
  }

  function resetBackgroundImage() {
    if (!canvas || !template?.image_url || !isCanvasReady(canvas)) return
    setBusy(true)
    setError(null)
    applyBackgroundFromSource(template.image_url, 'template', { crossOrigin: 'anonymous' })
      .catch((err) => {
        console.error(err)
        setError('Unable to restore the template background right now.')
      })
      .finally(() => setBusy(false))
  }

  function handleBackgroundChange(e) {
    if (!canvas) return
    const value = e.target.value
    setBackground(value)
    canvas.setBackgroundColor(value, canvas.renderAll.bind(canvas))
  }

  function exportPNG() {
    if (!canvas) return
    const url = canvas.toDataURL({ format: 'png', quality: 1 })
    const a = document.createElement('a')
    a.href = url
    a.download = `${(design?.title || template.name).replace(/\s+/g, '_')}.png`
    a.click()
  }

  async function save() {
    if (!canvas) return
    const payload = {
      title: design?.title || `${template.name} - ${defaultTitleSuffix}`,
      template_id: template.id,
      fabric_json: canvas.toJSON(FABRIC_EXPORT_PROPS),
    }
    await onSave(payload)
  }

  function selectLayer(id) {
    const obj = findLayerObject(id)
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.renderAll()
    refreshLayers()
  }

  function moveLayer(id, direction) {
    const obj = findLayerObject(id)
    if (!obj) return
    if (direction === 'up') canvas.bringForward(obj)
    if (direction === 'down') canvas.sendBackwards(obj)
    canvas.renderAll()
    refreshLayers()
  }

  function toggleLayer(id) {
    const obj = findLayerObject(id)
    if (!obj) return
    obj.visible = !obj.visible
    canvas.renderAll()
    refreshLayers()
  }

  function deleteLayer(id) {
    const obj = findLayerObject(id)
    if (!obj) return
    canvas.remove(obj)
    canvas.discardActiveObject()
    canvas.renderAll()
    refreshLayers()
  }

  function renameLayer(id, name) {
    const obj = findLayerObject(id)
    if (!obj) return
    obj.set('layerName', name.trim() || (obj.layerType === 'text' ? 'Text Layer' : 'Image Layer'))
    refreshLayers()
  }

  return (
    <div className="canvas-editor">
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="ghost" onClick={addText}>Add Text</button>
          <label className={`ghost file-input ${busy ? 'disabled' : ''}`}>
            <span>Add Photo</span>
            <input type="file" accept="image/*" onChange={uploadImage} disabled={busy} />
          </label>
          <label className={`ghost file-input ${busy ? 'disabled' : ''}`}>
            <span>Background Photo</span>
            <input type="file" accept="image/*" onChange={uploadBackgroundImage} disabled={busy} />
          </label>
          <label className="ghost background-picker">
            <span>Background</span>
            <input type="color" value={background} onChange={handleBackgroundChange} />
          </label>
          {hasCustomBackground && (
            <button className="ghost" type="button" onClick={resetBackgroundImage} disabled={busy}>
              Reset Background
            </button>
          )}
        </div>
        <div className="toolbar-actions">
          <button className="ghost" onClick={exportPNG}>Export PNG</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
      {error && <p className="error upload-error">{error}</p>}
      <div className="canvas-workspace">
        <div className="canvas-frame">
          <canvas ref={canvasRef} />
        </div>
        <aside className="layer-panel">
          <div className="layer-panel-header">
            <h4>Layers</h4>
            <p className="muted">Reorder, hide, or remove items.</p>
          </div>
          <ul className="layer-list">
            {layers.map((layer) => (
              <li key={layer.id} className={layer.id === activeLayer ? 'active' : ''}>
                <button className="layer-select" onClick={() => selectLayer(layer.id)}>
                  <span className="layer-type">{layer.type === 'text' ? 'Text' : 'Image'}</span>
                  <input
                    value={layer.name}
                    onChange={(e) => renameLayer(layer.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
                <div className="layer-controls">
                  <button onClick={() => moveLayer(layer.id, 'up')} title="Bring forward">Up</button>
                  <button onClick={() => moveLayer(layer.id, 'down')} title="Send backward">Down</button>
                  <button onClick={() => toggleLayer(layer.id)} title="Toggle visibility">
                    {layer.visible ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={() => deleteLayer(layer.id)} title="Delete">Delete</button>
                </div>
              </li>
            ))}
            {!layers.length && <li className="empty muted">Add text or images to manage layers.</li>}
          </ul>
        </aside>
      </div>
    </div>
  )
}
