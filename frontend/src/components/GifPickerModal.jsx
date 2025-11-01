import React, { useEffect, useMemo, useRef, useState } from 'react'

const TENOR_API_KEY = 'LIVDSRZULELA'
const TENOR_BASE_URL = 'https://g.tenor.com/v1'
const DEFAULT_SEARCH = 'celebration'

function extractGifMedia(result) {
  const formats =
    result?.media_formats ||
    (Array.isArray(result?.media) && result.media.length ? result.media[0] : {}) ||
    {}

  const preview =
    formats.tinygif?.url ||
    formats.nanogif?.url ||
    formats.mediumgif?.url ||
    formats.gif?.url ||
    null
  const full =
    formats.gif?.url ||
    formats.mediumgif?.url ||
    formats.tinygif?.url ||
    formats.nanogif?.url ||
    null
  if (!full) return null
  return {
    id: result.id,
    url: full,
    preview: preview || full,
    description: result.content_description || '',
  }
}

export default function GifPickerModal({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState(DEFAULT_SEARCH)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const abortRef = useRef(null)

  const hasResults = useMemo(() => results.length > 0, [results])

  useEffect(() => {
    if (!isOpen) return undefined
    document.body.style.overflow = 'hidden'
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    performSearch(query, true)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKey)
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  async function performSearch(term, initial = false) {
    if (!isOpen) return
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        limit: '24',
        media_filter: 'minimal',
      })
      let endpoint
      const trimmed = (term || '').trim()
      if (trimmed.length) {
        params.set('q', trimmed)
        endpoint = `${TENOR_BASE_URL}/search`
      } else {
        endpoint = `${TENOR_BASE_URL}/trending`
      }
      const response = await fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal })
      if (!response.ok) {
        throw new Error('Tenor request failed')
      }
      const payload = await response.json()
      const results = payload.results || []
      const gifs = results
        .map((item) => extractGifMedia(item))
        .filter(Boolean)
      setResults(gifs)
      if (initial && !trimmed.length) {
        setQuery(DEFAULT_SEARCH)
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error(err)
      setError('Unable to load GIFs. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    performSearch(query)
  }

  const handleSelect = (gif) => {
    onSelect(gif)
  }

  if (!isOpen) return null

  return (
    <div className="gif-modal-overlay" onClick={onClose}>
      <div
        className="gif-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gif-modal-header">
          <h3>Select a GIF</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <form className="gif-search" onSubmit={handleSubmit}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search celebration GIFs"
            autoFocus
          />
          <button type="submit" className="primary" disabled={loading}>
            Search
          </button>
        </form>
        {error && <p className="error small">{error}</p>}
        <div className="gif-results">
          {loading && <p className="muted">Loading GIFs…</p>}
          {!loading && !hasResults && (
            <p className="muted">No results. Try a different search term.</p>
          )}
          <div className="gif-grid">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                className="gif-thumb"
                onClick={() => handleSelect(item)}
                title={item.description || 'Insert GIF'}
              >
                <img src={item.preview} alt={item.description || 'GIF option'} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
