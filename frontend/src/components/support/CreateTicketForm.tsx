'use client'

import { useState, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import { colors } from '@/types'
import { X, UploadCloud, AlertCircle, RefreshCw } from 'lucide-react'

type Priority = 'low' | 'medium' | 'high' | 'urgent'

interface CreateTicketFormProps {
  onCreated: (ticketData?: any) => void
}

export function CreateTicketForm({ onCreated }: CreateTicketFormProps) {
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('Login & Security')
  const [priority, setPriority] = useState<Priority>('medium')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Image / screenshot attachment state
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categories = [
    'Login & Security',
    'Transfers & Payments',
    'Cards & Disputes',
    'Accounts & Statements',
    'Profile & Settings',
    'Technical Issue/Bug',
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (PNG, JPG, JPEG, WEBP)')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Image file must be under 10MB')
        return
      }
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
      setError(null)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          setImageFile(file)
          setImagePreview(URL.createObjectURL(file))
          setError(null)
          break
        }
      }
    }
  }

  const removeImage = () => {
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required')
      return
    }
    setBusy(true)
    setError(null)

    try {
      let attachmentUrl: string | null = null

      // If user attached an image, upload to Cloudinary first
      if (imageFile) {
        setUploadingImage(true)
        const formData = new FormData()
        formData.append('file', imageFile)
        const uploadRes: any = await apiClient.post('/api/v1/support/upload-attachment', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        if (uploadRes?.success && uploadRes?.data?.url) {
          attachmentUrl = uploadRes.data.url
        }
        setUploadingImage(false)
      }

      const payload = {
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
        attachment_url: attachmentUrl
      }

      const res = await apiClient.post<{ success: boolean; data: any }>('/api/v1/support/tickets', payload)
      if (res?.success === true) {
        const createdTicket = res.data
        setSubject('')
        setDescription('')
        setPriority('medium')
        removeImage()
        onCreated(createdTicket)
      } else {
        setError('Failed to create ticket. Please try again.')
      }
    } catch (err: any) {
      console.error('Error creating ticket:', err)
      setError('Failed to create ticket. Please try again.')
    } finally {
      setBusy(false)
      setUploadingImage(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      onPaste={handlePaste}
      className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm space-y-4"
      style={{ borderColor: colors.border }}
    >
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: colors.borderLight }}>
        <div>
          <h3 className="text-base font-bold text-slate-900">Create Official Service Request</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit your inquiry to open a secure direct communication thread with our advisors.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Inquiry Subject *</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. Card transaction restriction inquiry"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Priority Level</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="low">Low (General question)</option>
            <option value="medium">Medium (Standard request)</option>
            <option value="high">High (Time sensitive)</option>
            <option value="urgent">Urgent (Account security or freeze)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Attach Screenshot (Optional)
          </label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-dashed border-slate-300 rounded-xl bg-slate-50/60 hover:bg-slate-100 flex items-center justify-center gap-2 text-slate-600 transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-blue-600" />
            <span>{imageFile ? 'Change Screenshot' : 'Upload or Paste Screenshot (PNG/JPG)'}</span>
          </button>
        </div>
      </div>

      {/* Image Preview Thumbnail */}
      {imagePreview && (
        <div className="relative w-fit rounded-xl border border-slate-200 p-1.5 bg-slate-50">
          <img
            src={imagePreview}
            alt="Attachment preview"
            className="h-28 max-w-xs object-cover rounded-lg"
          />
          <button
            type="button"
            onClick={removeImage}
            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description of Issue *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[110px]"
          placeholder="Please describe your question or issue in detail. You can also paste screenshots here."
          required
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-[11px] text-slate-400">
          A dedicated specialist will be assigned immediately upon creation.
        </span>
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2.5 rounded-xl text-white font-semibold text-xs sm:text-sm transition-all disabled:opacity-50 hover:brightness-105 active:scale-95 shadow-sm flex items-center gap-2"
          style={{ backgroundColor: colors.primary }}
        >
          {busy ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{uploadingImage ? 'Uploading screenshot…' : 'Submitting…'}</span>
            </>
          ) : (
            'Submit Ticket & Start Chat'
          )}
        </button>
      </div>
    </form>
  )
}
