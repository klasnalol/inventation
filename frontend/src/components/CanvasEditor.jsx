import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fabric } from 'fabric'
import api from '../api'
import giflerLib from 'gifler'
import GifPickerModal from './GifPickerModal'
import { useI18n } from '../i18n'

export const FABRIC_EXPORT_PROPS = [
  'selectable',
  'evented',
  'layerId',
  'layerName',
  'layerType',
  'backgroundTag',
  'gifSource',
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
  sizeOptions = [],
  sizeKey = null,
  sizeDimensions = null,
  onSizeChange,
  allowSizeChange = false,
}){
  const canvasRef = useRef(null)
  const [canvas, setCanvas] = useState(null)
  const [busy, setBusy] = useState(false)
  const [layers, setLayers] = useState([])
  const [activeLayer, setActiveLayer] = useState(null)
  const [background, setBackground] = useState(DEFAULT_BG)
  const [hasCustomBackground, setHasCustomBackground] = useState(false)
  const [error, setError] = useState(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const gifAnimationsRef = useRef(new Map())
  const canvasContainerRef = useRef(null)
  const baseSizeRef = useRef({
    width: sizeDimensions?.width || template?.width || 1200,
    height: sizeDimensions?.height || template?.height || 1800,
  })
  const resolvedSize = useMemo(() => {
    const width = sizeDimensions?.width || template?.width || baseSizeRef.current.width || 1200
    const height = sizeDimensions?.height || template?.height || baseSizeRef.current.height || 1800
    return { width, height }
  }, [sizeDimensions?.width, sizeDimensions?.height, template?.width, template?.height])
  const { t } = useI18n()

  const recomputeViewport = useCallback(() => {
    if (!canvas || !isCanvasReady(canvas)) return
    const { width: baseWidth = 1200, height: baseHeight = 1800 } = baseSizeRef.current
    if (!baseWidth || !baseHeight) return
    const host = canvasContainerRef.current
    let availableWidth = baseWidth
    if (host?.parentElement) {
      const parent = host.parentElement
      const computed = typeof window !== 'undefined' ? window.getComputedStyle(parent) : null
      const paddingLeft = computed ? parseFloat(computed.paddingLeft || '0') : 0
      const paddingRight = computed ? parseFloat(computed.paddingRight || '0') : 0
      const horizontalPadding = paddingLeft + paddingRight
      availableWidth = Math.max(parent.clientWidth - horizontalPadding, 240)
    } else if (typeof window !== 'undefined') {
      availableWidth = Math.max(window.innerWidth - 64, 240)
    }
    const zoom = Math.min(Math.max(availableWidth / baseWidth, 0.1), 1)
    const displayWidth = Math.round(baseWidth * zoom)
    const displayHeight = Math.round(baseHeight * zoom)

    canvas.setDimensions({ width: baseWidth, height: baseHeight }, { backstoreOnly: true })
    canvas.setDimensions({ width: displayWidth, height: displayHeight })
    canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0])

    if (canvas.lowerCanvasEl) {
      canvas.lowerCanvasEl.style.width = `${displayWidth}px`
      canvas.lowerCanvasEl.style.height = `${displayHeight}px`
    }
    if (canvas.upperCanvasEl) {
      canvas.upperCanvasEl.style.width = `${displayWidth}px`
      canvas.upperCanvasEl.style.height = `${displayHeight}px`
    }
    if (host) {
      host.style.setProperty('--canvas-display-width', `${displayWidth}px`)
      host.style.setProperty('--canvas-display-height', `${displayHeight}px`)
      host.style.width = `${displayWidth}px`
      host.style.height = `${displayHeight}px`
      host.style.minWidth = `${displayWidth}px`
      host.style.minHeight = `${displayHeight}px`
    }

    canvas.renderAll()
    canvas.calcOffset()
  }, [canvas])

  const ensureMetadata = useCallback((obj) => {
    if (!obj) return
    if (!obj.layerId) {
      obj.set('layerId', `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
    }
    if (!obj.layerType) {
      obj.set('layerType', obj.type === 'textbox' ? 'text' : 'image')
    }
    if (!obj.layerName) {
      const defaultName =
        obj.layerType === 'gif'
          ? t('GIF Layer')
          : obj.layerType === 'text' || obj.type === 'textbox'
            ? t('Text Layer')
            : t('Image Layer')
      obj.set('layerName', defaultName)
    }
  }, [t])

  const stopGifAnimation = useCallback((layerId) => {
    if (!layerId) return
    const record = gifAnimationsRef.current.get(layerId)
    if (record?.animation?.stop) {
      record.animation.stop()
    }
    if (record?.xhr?.abort) {
      try {
        record.xhr.abort()
      } catch (err) {
        console.warn('Failed to abort GIF request', err)
      }
    }
    gifAnimationsRef.current.delete(layerId)
  }, [])

  const clearGifAnimations = useCallback(() => {
    gifAnimationsRef.current.forEach((record) => {
      if (record?.animation?.stop) record.animation.stop()
    })
    gifAnimationsRef.current.clear()
  }, [])

  const startGifAnimation = useCallback((target, source) => {
    if (!canvas || !target || !source || !isCanvasReady(canvas)) return
    const giflerFn =
      typeof giflerLib === 'function'
        ? giflerLib
        : typeof giflerLib?.default === 'function'
          ? giflerLib.default
          : typeof window !== 'undefined'
            ? window.gifler
            : null
    if (typeof giflerFn !== 'function') {
      console.warn('GIF playback library not available')
      return
    }
    const layerId = target.layerId || target.get?.('layerId')
    if (!layerId) return

    stopGifAnimation(layerId)

    const gifCanvas = document.createElement('canvas')
    const ctx = gifCanvas.getContext('2d')
    if (!ctx) return

    const initialWidth = target.width || target._element?.width || 1
    const initialHeight = target.height || target._element?.height || 1

    gifCanvas.width = initialWidth
    gifCanvas.height = initialHeight

    const scaleX = target.scaleX || 1
    const scaleY = target.scaleY || 1

    target.set({
      gifSource: source,
      layerType: 'gif',
    })
    target.setElement(gifCanvas)
    target._setWidthHeight()
    target.scaleX = scaleX
    target.scaleY = scaleY
    target.setCoords()
    canvas.requestRenderAll()

    const giflerInstance = giflerFn(source)
    gifAnimationsRef.current.set(layerId, { xhr: giflerInstance.xhr, canvas: gifCanvas })
    if (giflerInstance.xhr) {
      const handleFailure = () => {
        gifAnimationsRef.current.delete(layerId)
      }
      giflerInstance.xhr.addEventListener('error', handleFailure, { once: true })
      giflerInstance.xhr.addEventListener('abort', handleFailure, { once: true })
    }

    giflerInstance.get((animator) => {
      animator.onDrawFrame = (frameCtx, frame) => {
        if (!frameCtx || !frame) return
        if (gifCanvas.width !== frame.width || gifCanvas.height !== frame.height) {
          gifCanvas.width = frame.width
          gifCanvas.height = frame.height
          target._setWidthHeight()
          target.scaleX = scaleX
          target.scaleY = scaleY
          target.setCoords()
        }
        frameCtx.clearRect(0, 0, gifCanvas.width, gifCanvas.height)
        frameCtx.drawImage(frame.buffer, frame.x, frame.y)
        target.dirty = true
        fabric.util.requestAnimFrame(() => {
          if (canvas && isCanvasReady(canvas)) {
            canvas.requestRenderAll()
          }
        })
      }
      const runner = animator.animateInCanvas(gifCanvas, true)
      gifAnimationsRef.current.set(layerId, {
        animation: runner,
        canvas: gifCanvas,
        xhr: giflerInstance.xhr,
      })
      return runner
    })
  }, [canvas, stopGifAnimation])

  useEffect(() => {
    const c = new fabric.Canvas(canvasRef.current, { preserveObjectStacking: true })
    setCanvas(c)
    if (onCanvasReady) onCanvasReady(c)
    return () => {
      clearGifAnimations()
      if (onCanvasReady) onCanvasReady(null)
      c.dispose()
    }
  }, [clearGifAnimations, onCanvasReady])

  useEffect(() => () => clearGifAnimations(), [clearGifAnimations])

  useEffect(() => {
    if (!canvas) return
    recomputeViewport()
  }, [canvas, recomputeViewport])

  useEffect(() => {
    if (!resolvedSize.width || !resolvedSize.height) return
    baseSizeRef.current = {
      width: resolvedSize.width,
      height: resolvedSize.height,
    }
    recomputeViewport()
  }, [resolvedSize.width, resolvedSize.height, recomputeViewport])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleResize = () => recomputeViewport()
    window.addEventListener('resize', handleResize)
    let observer
    if (typeof ResizeObserver !== 'undefined' && canvasContainerRef.current) {
      const target = canvasContainerRef.current.parentElement || canvasContainerRef.current
      observer = new ResizeObserver(() => recomputeViewport())
      observer.observe(target)
    }
    return () => {
      window.removeEventListener('resize', handleResize)
      if (observer) observer.disconnect()
    }
  }, [recomputeViewport])

  const refreshLayers = useCallback(() => {
    if (!canvas) return
    const active = canvas.getActiveObject()
    const objects = canvas
      .getObjects()
      .filter((obj) => obj && obj !== canvas.backgroundImage)
      .map((obj, index) => {
        const fallbackName =
          obj.layerType === 'gif'
            ? t('GIF Layer')
            : obj.layerType === 'text' || obj.type === 'textbox'
              ? t('Text Layer')
              : t('Image Layer')
        return {
          id: obj.layerId,
          name: obj.layerName || fallbackName,
          type: obj.layerType || (obj.type === 'textbox' ? 'text' : obj.type),
          visible: obj.visible !== false,
          index,
        }
      })
      .reverse()
    setLayers(objects)
    setActiveLayer(active && active !== canvas.backgroundImage ? active.layerId : null)
  }, [canvas, t])

  useEffect(() => {
    if (!canvas) return

    const handleAdd = (e) => {
      if (!e.target || e.target === canvas.backgroundImage) return
      ensureMetadata(e.target)
      if (e.target.layerType === 'gif' && e.target.gifSource) {
        startGifAnimation(e.target, e.target.gifSource)
      }
      refreshLayers()
    }
    const handleRemove = (e) => {
      if (!e.target || e.target === canvas.backgroundImage) return
       if (e.target.layerType === 'gif') {
        stopGifAnimation(e.target.layerId)
      }
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
  }, [canvas, ensureMetadata, refreshLayers, startGifAnimation, stopGifAnimation])

  const addOverlayImageToCanvas = useCallback((img) => {
    if (!canvas || !img || !isCanvasReady(canvas)) return
    const { width, height } = baseSizeRef.current
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
    return img
  }, [canvas, ensureMetadata])

  const applyBackgroundFromSource = useCallback(
    async (source, tag = 'custom', options = {}) => {
      if (!canvas || !source || !isCanvasReady(canvas)) throw new Error('Missing canvas or image source')
      const targetCanvas = canvas
      const img = await loadFabricImage(source, options)
      if (!targetCanvas || targetCanvas !== canvas || !isCanvasReady(targetCanvas)) return null
      const { width, height } = baseSizeRef.current
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

    clearGifAnimations()
    canvas.clear()
    setError(null)

    const bootstrap = async () => {
      if (!canvas || !isCanvasReady(canvas)) return
      const instance = canvas
      const baseWidth = resolvedSize.width || template.width || 1200
      const baseHeight = resolvedSize.height || template.height || 1800
      baseSizeRef.current = {
        width: baseWidth,
        height: baseHeight,
      }
      instance.setWidth(baseWidth)
      instance.setHeight(baseHeight)
      try {
        await applyBackgroundFromSource(template.image_url, 'template', { crossOrigin: 'anonymous' })
      } catch (err) {
        console.error(err)
        if (isCanvasReady(instance)) {
          instance.setBackgroundColor(DEFAULT_BG, instance.renderAll.bind(instance))
        }
        setHasCustomBackground(false)
      }
      recomputeViewport()
      if (!isCanvasReady(instance)) return
      if (design?.fabric_json) {
        instance.loadFromJSON(design.fabric_json, () => {
          if (!isCanvasReady(instance)) return
          instance.setWidth(baseWidth)
          instance.setHeight(baseHeight)
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
          instance.getObjects().forEach((obj) => {
            if (obj.layerType === 'gif' && obj.gifSource) {
              startGifAnimation(obj, obj.gifSource)
            }
          })
          refreshLayers()
          recomputeViewport()
        })
      } else {
        const textbox = new fabric.Textbox(t(defaultText), {
          left: baseWidth * 0.1,
          top: baseHeight * 0.1,
          width: baseWidth * 0.8,
          fontSize: Math.round(baseWidth * 0.06),
          fill: '#111',
          textAlign: 'center',
          fontFamily: 'Georgia, serif',
        })
        ensureMetadata(textbox)
        if (!isCanvasReady(instance)) return
        instance.add(textbox)
        instance.setBackgroundColor(DEFAULT_BG, instance.renderAll.bind(instance))
        setBackground(DEFAULT_BG)
        setHasCustomBackground(false)
        recomputeViewport()
      }
    }

    bootstrap()
  }, [
    applyBackgroundFromSource,
    canvas,
    clearGifAnimations,
    design,
    ensureMetadata,
    refreshLayers,
    startGifAnimation,
    template,
  ])

  const findLayerObject = useCallback(
    (layerId) => {
      if (!canvas) return null
      return canvas.getObjects().find((obj) => obj.layerId === layerId) || null
    },
    [canvas]
  )

  function addText() {
    if (!canvas) return
    const text = new fabric.Textbox(t('Double-click to edit'), {
      left: 60,
      top: 60,
      width: 400,
      fontSize: 42,
      fill: '#222',
    })
    ensureMetadata(text)
    canvas.add(text)
    canvas.setActiveObject(text)
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
            ? t('Login required to upload to the server. Used a local copy instead.')
            : t('Upload failed - used a local copy instead.')
        )
      } catch (fallbackErr) {
        console.error(fallbackErr)
        setError(t('Unable to load that image. Please try a different file.'))
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
            ? t('Login required to upload backgrounds. Using a local background instead.')
            : t('Background upload failed - using a local background instead.')
        )
      } catch (fallbackErr) {
        console.error(fallbackErr)
        setError(t('Unable to load that background. Please try another image.'))
      }
    } finally {
      setBusy(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleGifSelect = useCallback(
    async (gif) => {
      if (!gif?.url || !canvas || !isCanvasReady(canvas)) return
      setBusy(true)
      try {
        const previewCandidates = [gif.preview, gif.url].filter(Boolean)
        let img = null
        let lastErr = null
        for (const src of previewCandidates) {
          try {
            img = await loadFabricImage(src, { crossOrigin: 'anonymous' })
            break
          } catch (err) {
            lastErr = err
          }
        }
        if (!img) {
          for (const remoteSrc of previewCandidates) {
            try {
              const resp = await fetch(remoteSrc, { mode: 'cors' })
              if (!resp.ok) continue
              const blob = await resp.blob()
              const localUrl = URL.createObjectURL(blob)
              img = await loadFabricImage(localUrl)
              if (img) img.gifObjectUrl = localUrl
              break
            } catch (err) {
              lastErr = err
            }
          }
        }
        if (!img) {
          throw lastErr || new Error('Unable to load GIF preview')
        }
        img.set({
          layerType: 'gif',
          layerName: t('GIF Layer'),
          gifSource: gif.url,
        })
        const added = addOverlayImageToCanvas(img)
        if (added) {
          startGifAnimation(added, gif.url)
          if (added.gifObjectUrl) {
            URL.revokeObjectURL(added.gifObjectUrl)
            delete added.gifObjectUrl
          }
        }
        setError(null)
        setShowGifPicker(false)
      } catch (err) {
        console.error(err)
        setError(t('Unable to add that GIF. Please try another one.'))
      } finally {
        setBusy(false)
      }
    },
    [addOverlayImageToCanvas, canvas, startGifAnimation]
  )

  function resetBackgroundImage() {
    if (!canvas || !template?.image_url || !isCanvasReady(canvas)) return
    setBusy(true)
    setError(null)
    applyBackgroundFromSource(template.image_url, 'template', { crossOrigin: 'anonymous' })
      .catch((err) => {
        console.error(err)
        setError(t('Unable to restore the template background right now.'))
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
    const baseWidth = baseSizeRef.current.width || template?.width || 1200
    const baseHeight = baseSizeRef.current.height || template?.height || 1800
    const snapshot = canvas.toJSON(FABRIC_EXPORT_PROPS)
    snapshot.width = baseWidth
    snapshot.height = baseHeight
    snapshot.meta = {
      ...(snapshot.meta || {}),
      baseWidth,
      baseHeight,
      sizeKey,
    }
    const payload = {
      title: design?.title || `${template?.name || 'Invitation'} - ${defaultTitleSuffix}`,
      template_id: template?.id || design?.template_id,
      fabric_json: snapshot,
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
          {allowSizeChange && sizeOptions.length > 0 && (
            <label className="ghost size-picker">
              <span>{t('Canvas size')}</span>
              <select
                value={sizeKey || sizeOptions[0]?.id || 'template'}
                onChange={(e) => onSizeChange?.(e.target.value)}
              >
                {sizeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="ghost" onClick={addText}>{t('Add Text')}</button>
          <label className={`ghost file-input ${busy ? 'disabled' : ''}`}>
            <span>{t('Add Photo')}</span>
            <input type="file" accept="image/*" onChange={uploadImage} disabled={busy} />
          </label>
          <button className="ghost" type="button" onClick={() => setShowGifPicker(true)} disabled={busy}>
            {t('Add GIF')}
          </button>
          <label className={`ghost file-input ${busy ? 'disabled' : ''}`}>
            <span>{t('Background Photo')}</span>
            <input type="file" accept="image/*" onChange={uploadBackgroundImage} disabled={busy} />
          </label>
          <label className="ghost background-picker">
            <span>{t('Background')}</span>
            <input type="color" value={background} onChange={handleBackgroundChange} />
          </label>
          {hasCustomBackground && (
            <button className="ghost" type="button" onClick={resetBackgroundImage} disabled={busy}>
              {t('Reset Background')}
            </button>
          )}
        </div>
        <div className="toolbar-actions">
          <button className="ghost" onClick={exportPNG}>{t('Export PNG')}</button>
          <button className="primary" onClick={save}>{t('Save')}</button>
        </div>
      </div>
      {error && <p className="error upload-error">{error}</p>}
      <div className="canvas-workspace">
        <div className="canvas-frame" ref={canvasContainerRef}>
          <canvas ref={canvasRef} />
        </div>
        <aside className="layer-panel">
          <div className="layer-panel-header">
            <h4>{t('Layers')}</h4>
            <p className="muted">{t('Reorder, hide, or remove items.')}</p>
          </div>
          <ul className="layer-list">
            {layers.map((layer) => (
              <li key={layer.id} className={layer.id === activeLayer ? 'active' : ''}>
                <button className="layer-select" onClick={() => selectLayer(layer.id)}>
                  <span className="layer-type">
                    {layer.type === 'text' ? t('Text') : layer.type === 'gif' ? t('GIF') : t('Image')}
                  </span>
                  <input
                    value={layer.name}
                    onChange={(e) => renameLayer(layer.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
                <div className="layer-controls">
                  <button onClick={() => moveLayer(layer.id, 'up')} title={t('Bring forward')}>{t('Up')}</button>
                  <button onClick={() => moveLayer(layer.id, 'down')} title={t('Send backward')}>{t('Down')}</button>
                  <button onClick={() => toggleLayer(layer.id)} title={t('Toggle visibility')}>
                    {layer.visible ? t('Hide') : t('Show')}
                  </button>
                  <button onClick={() => deleteLayer(layer.id)} title={t('Delete')}>{t('Delete')}</button>
                </div>
              </li>
            ))}
            {!layers.length && <li className="empty muted">{t('Add text or images to manage layers.')}</li>}
          </ul>
        </aside>
      </div>
      <GifPickerModal
        isOpen={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onSelect={handleGifSelect}
      />
    </div>
  )
}
