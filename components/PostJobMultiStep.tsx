'use client'

import { useState } from 'react'
import { Plus, Minus, X, DollarSign, Users, CreditCard } from 'lucide-react'

interface PostJobMultiStepProps {
  // Form state
  address: string
  setAddress: (val: string) => void
  phone: string
  setPhone: (val: string) => void
  category: string
  setCategory: (val: string) => void
  emergencyType: string
  setEmergencyType: (val: string) => void
  details: string
  setDetails: (val: string) => void
  sendAll: boolean
  setSendAll: (val: boolean) => void
  picked: string | null
  setPicked: (val: string | null) => void

  // Payment
  paymentType: 'direct' | 'bids'
  setPaymentType: (val: 'direct' | 'bids') => void
  directAmount: string
  setDirectAmount: (val: string) => void
  hasSavedCard: boolean
  checkingCard?: boolean

  // Validation
  errors: Record<string, string>
  touched: Record<string, boolean>
  validateField: (field: string, value: string) => boolean
  handleFieldBlur: (field: string, value: string) => void

  // Data
  emergencyCategories: Array<{ key: string; label: string }>
  emergencyTypesMap: Record<string, Array<{ key: string; label: string; icon: string }>>
  nearbyContractors: any[]
  selectedContractor: any

  // Actions
  getCurrentLocation: () => void
  onSubmit: () => void
  onAddCard?: () => void

  // Photos
  photos: File[]
  setPhotos: (files: File[] | ((prev: File[]) => File[])) => void
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadError: string

  // Auth
  userId: string | null

  // Initial step (optional - defaults to 1)
  initialStep?: number
}

export default function PostJobMultiStep(props: PostJobMultiStepProps) {
  const [descriptionOpen, setDescriptionOpen] = useState(false)

  // Get all services from the first (home) category
  const allServices = props.emergencyTypesMap['home'] || []

  // Get selected service info
  const selectedService = props.emergencyType
    ? allServices.find(t => t.key === props.emergencyType)
    : null

  const handleServiceClick = (key: string) => {
    // Auto-set category to 'home' when selecting a service
    if (props.category !== 'home') {
      props.setCategory('home')
    }
    props.setEmergencyType(key)
  }

  return (
    <div className="card p-4 sm:p-6 space-y-4">
      {/* Header with Payment Type */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Post a Job</h2>
          <p className="text-slate-500 text-sm mt-1">Tell us what you need help with</p>
        </div>

        {/* Payment Type Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => props.setPaymentType('direct')}
            className={`flex-1 p-2.5 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              props.paymentType === 'direct'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 hover:border-slate-300 text-slate-600'
            }`}
          >
            <DollarSign className="h-4 w-4" />
            Direct Payment
          </button>
          <button
            type="button"
            onClick={() => props.setPaymentType('bids')}
            className={`flex-1 p-2.5 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              props.paymentType === 'bids'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 hover:border-slate-300 text-slate-600'
            }`}
          >
            <Users className="h-4 w-4" />
            Get Bids
          </button>
        </div>

        {/* Direct Payment Amount */}
        {props.paymentType === 'direct' && (
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
              <input
                type="number"
                value={props.directAmount}
                onChange={(e) => props.setDirectAmount(e.target.value)}
                placeholder="Your offer amount"
                min="1"
                step="1"
                className="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              />
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${props.hasSavedCard ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <CreditCard className={`h-3.5 w-3.5 ${props.hasSavedCard ? 'text-emerald-600' : 'text-amber-600'}`} />
              {props.hasSavedCard ? (
                <span className="text-emerald-700">Card on file • Amount held when posted</span>
              ) : (
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-amber-700">No card on file</span>
                  <button type="button" onClick={props.onAddCard} className="font-medium text-emerald-600 hover:underline">Add Card</button>
                </div>
              )}
            </div>
          </div>
        )}

        {props.paymentType === 'bids' && (
          <p className="text-xs text-slate-500 -mt-2">
            Contractors will submit bids. You choose the best offer.
          </p>
        )}
      </div>

      {/* Service Type - Direct category selection (Uber-style) */}
      <div className="grid grid-cols-4 gap-2">
        {allServices.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleServiceClick(key)}
            className={`p-2 rounded-xl border-2 text-center transition-all ${
              props.emergencyType === key
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-100 hover:border-slate-200 bg-slate-50'
            }`}
          >
            <span className="text-2xl block mb-0.5">{icon}</span>
            <span className="text-xs text-slate-700 leading-tight block">{label.replace(' Emergency', '')}</span>
          </button>
        ))}
      </div>

      {/* Description (collapsible) */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setDescriptionOpen(!descriptionOpen)}
          className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <span className="text-sm font-medium text-slate-700">
            Add Description <span className="text-slate-400">(optional)</span>
          </span>
          {descriptionOpen ? (
            <Minus className="w-5 h-5 text-slate-500" />
          ) : (
            <Plus className="w-5 h-5 text-slate-500" />
          )}
        </button>
        {descriptionOpen && (
          <div className="p-4 border-t border-slate-200">
            <textarea
              value={props.details}
              onChange={(e) => props.setDetails(e.target.value)}
              placeholder="Describe your issue..."
              rows={3}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none text-sm"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Photo Upload */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Photos <span className="text-slate-400">(optional)</span>
        </label>

        <div className="grid grid-cols-3 gap-2">
          {props.photos.map((file, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={URL.createObjectURL(file)}
                alt={`Upload ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => props.setPhotos((prev: File[]) => prev.filter((_: File, idx: number) => idx !== i))}
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          ))}

          {props.photos.length < 6 && (
            <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
              <Plus className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-400 mt-1">Add</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={props.onUpload}
                className="hidden"
              />
            </label>
          )}
        </div>

        {props.uploadError && (
          <p className="text-xs text-red-500">{props.uploadError}</p>
        )}
        <p className="text-xs text-slate-400">Up to 6 photos or videos of the issue</p>
      </div>

      {/* Submit Button */}
      <button
        type="button"
        onClick={props.onSubmit}
        disabled={!props.emergencyType}
        className={`w-full py-3.5 rounded-lg font-semibold transition-colors ${
          props.emergencyType
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        Post Job Request
      </button>

      {!props.userId && (
        <p className="text-xs text-center text-slate-500">
          You'll need to sign in to submit your request
        </p>
      )}
    </div>
  )
}
