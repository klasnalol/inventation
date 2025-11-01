import React, { useMemo, useState } from 'react'

function normalizeField(value) {
  const trimmed = (value || '').trim()
  return trimmed.length ? trimmed : null
}

export default function GuestList({
  designId,
  guests,
  loading,
  error,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [formValues, setFormValues] = useState({
    name: '',
    contact: '',
    comment: '',
    is_confirmed: false,
  })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({ name: '', contact: '', comment: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)

  const guestItems = useMemo(() => guests.slice(), [guests])

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    setActionError(null)
    if (!formValues.name.trim()) {
      setFormError('Guest name is required.')
      return
    }
    setSubmitting(true)
    try {
      await onCreate({
        name: formValues.name.trim(),
        contact: normalizeField(formValues.contact),
        comment: normalizeField(formValues.comment),
        is_confirmed: !!formValues.is_confirmed,
      })
      setFormValues({
        name: '',
        contact: '',
        comment: '',
        is_confirmed: false,
      })
    } catch (err) {
      setFormError(err?.message || 'Unable to add guest right now.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(guest) {
    setEditingId(guest.id)
    setEditValues({
      name: guest.name || '',
      contact: guest.contact || '',
      comment: guest.comment || '',
    })
    setActionError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValues({ name: '', contact: '', comment: '' })
    setActionError(null)
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    if (!editingId) return
    if (!editValues.name.trim()) {
      setActionError('Guest name cannot be empty.')
      return
    }
    setEditSubmitting(true)
    setActionError(null)
    try {
      await onUpdate(editingId, {
        name: editValues.name.trim(),
        contact: normalizeField(editValues.contact),
        comment: normalizeField(editValues.comment),
      })
      cancelEdit()
    } catch (err) {
      setActionError(err?.message || 'Unable to update guest.')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function toggleConfirmed(guest) {
    setActionError(null)
    try {
      await onUpdate(guest.id, { is_confirmed: !guest.is_confirmed })
    } catch (err) {
      setActionError(err?.message || 'Unable to update guest status.')
    }
  }

  async function handleDelete(guest) {
    if (!window.confirm(`Remove ${guest.name}?`)) return
    setActionError(null)
    try {
      await onDelete(guest.id)
    } catch (err) {
      setActionError(err?.message || 'Unable to delete guest.')
    }
  }

  return (
    <div className="card guest-card">
      <h3>Guest list</h3>
      <p className="muted small">Track invited guests and confirmations manually.</p>

      {!designId && <p className="error small">Save your design before adding guests.</p>}
      {error && <p className="error small">{error}</p>}
      {formError && <p className="error small">{formError}</p>}
      {actionError && <p className="error small">{actionError}</p>}

      <form className="guest-form" onSubmit={handleSubmit}>
        <div className="field-row">
          <input
            type="text"
            placeholder="Guest name"
            value={formValues.name}
            onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
            disabled={!designId || submitting}
            required
          />
          <input
            type="text"
            placeholder="Contact info (optional)"
            value={formValues.contact}
            onChange={(e) => setFormValues((prev) => ({ ...prev, contact: e.target.value }))}
            disabled={!designId || submitting}
          />
        </div>
        <textarea
          placeholder="Comment (optional)"
          value={formValues.comment}
          onChange={(e) => setFormValues((prev) => ({ ...prev, comment: e.target.value }))}
          disabled={!designId || submitting}
          rows={2}
        />
        <label className="guest-checkbox">
          <input
            type="checkbox"
            checked={formValues.is_confirmed}
            onChange={(e) =>
              setFormValues((prev) => ({ ...prev, is_confirmed: e.target.checked }))
            }
            disabled={!designId || submitting}
          />
          Mark as confirmed
        </label>
        <button type="submit" className="primary" disabled={!designId || submitting}>
          {submitting ? 'Adding...' : 'Add guest'}
        </button>
      </form>

      <div className="guest-actions-header">
        <button
          type="button"
          className="ghost"
          onClick={() => onRefresh && onRefresh()}
          disabled={!designId || loading}
        >
          {loading ? 'Refreshing...' : 'Refresh guests'}
        </button>
        <span className="muted small">
          {guestItems.length} {guestItems.length === 1 ? 'guest' : 'guests'}
        </span>
      </div>

      <ul className="guest-list">
        {loading && <li className="muted">Loading guests...</li>}
        {!loading && !guestItems.length && (
          <li className="muted">No guests yet. Add your first invitee above.</li>
        )}
        {guestItems.map((guest) => (
          <li key={guest.id} className={guest.is_confirmed ? 'confirmed' : ''}>
            <div className="guest-header">
              <div>
                <strong>{guest.name}</strong>
                {guest.contact && <span className="muted guest-contact">{guest.contact}</span>}
              </div>
              <span className={`badge ${guest.is_confirmed ? 'badge-success' : 'badge-muted'}`}>
                {guest.is_confirmed ? 'Confirmed' : 'Pending'}
              </span>
            </div>

            {guest.comment && <p className="muted guest-comment">{guest.comment}</p>}

            {editingId === guest.id ? (
              <form className="guest-edit-form" onSubmit={handleEditSubmit}>
                <div className="field-row">
                  <input
                    type="text"
                    value={editValues.name}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  <input
                    type="text"
                    value={editValues.contact}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, contact: e.target.value }))}
                    placeholder="Contact info"
                  />
                </div>
                <textarea
                  rows={2}
                  value={editValues.comment}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="Comment"
                />
                <div className="guest-edit-actions">
                  <button type="submit" className="primary" disabled={editSubmitting}>
                    {editSubmitting ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="ghost" onClick={cancelEdit} disabled={editSubmitting}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="guest-item-actions">
                <button type="button" className="ghost" onClick={() => toggleConfirmed(guest)}>
                  {guest.is_confirmed ? 'Mark pending' : 'Mark confirmed'}
                </button>
                <button type="button" className="ghost" onClick={() => startEdit(guest)}>
                  Edit details
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => handleDelete(guest)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
