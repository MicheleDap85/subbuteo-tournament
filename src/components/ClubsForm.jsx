import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ClubsForm({ onCreated }) {
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleUpload() {
    if (!file) return ''
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('logos').upload(fileName, file)
    if (error) throw error
    const { data: publicUrl } = supabase.storage.from('logos').getPublicUrl(fileName)
    return publicUrl.publicUrl
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      setSaving(true)
      let logo = logoUrl
      if (!logo && file) {
        logo = await handleUpload()
      }
      const { error } = await supabase.from('clubs').insert([{ name, logo_url: logo || null }])
      if (error) throw error
      setName('')
      setLogoUrl('')
      setFile(null)
      onCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="mb-2">
        <label className="form-label">Nome club</label>
        <input
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="mb-2">
        <label className="form-label">Logo URL (opz.)</label>
        <input
          className="form-control"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="mb-3">
        <label className="form-label">oppure carica file</label>
        <input
          type="file"
          className="form-control"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      <button className="btn btn-primary w-100" disabled={saving}>
        {saving ? 'Salvataggio…' : 'Aggiungi Club'}
      </button>
    </form>
  )
}
