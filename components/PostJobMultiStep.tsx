'use client'

import { useState } from 'react'
import { Plus, Minus, ChevronDown } from 'lucide-react'

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
  const [showServices, setShowServices] = useState(!props.emergencyType)

  // Get selected service info
  const selectedService = props.emergencyType
    ? props.emergencyTypesMap[props.category]?.find(t => t.key === props.emergencyType)
    : null

  const handleCategoryClick = (key: string) => {
    if (props.category === key) {
      // Same category clicked - toggle services visibility
      setShowServices(!showServices)
    } else {
      // Different category - switch and show services
      props.setCategory(key)
      props.setEmergencyType('')
      setShowServices(true)
    }
  }

  const handleServiceClick = (key: string) => {
    props.setEmergencyType(key)
    setShowServices(false)
    setDescriptionOpen(false)
  }

  return (
    <div className="card p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Post a Job</h2>
        <p className="text-slate-500 text-sm mt-1">Tell us what you need help with</p>
      </div>

      {/* Service Type */}
      <div className="space-y-2">
        <div className={`grid gap-2 ${props.emergencyCategories.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {props.emergencyCategories.map(({ key, label }) => {
            const isSelected = props.category === key
            const icon = key === 'home' ? '🏠' : '🚗'
            const hasService = isSelected && selectedService

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategoryClick(key)}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-between ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{icon}</span>
                  <span>{label}</span>
                </span>
                {isSelected && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${showServices ? 'rotate-180' : ''}`} />
                )}
              </button>
            )
          })}
        </div>

        {/* Selected service badge */}
        {selectedService && !showServices && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-lg">{selectedService.icon}</span>
            <span className="text-sm font-medium text-emerald-700">
              {selectedService.label.replace(' Emergency', '')}
            </span>
            <button
              type="button"
              onClick={() => setShowServices(true)}
              className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 underline"
            >
              Change
            </button>
          </div>
        )}

        {/* Specific services dropdown */}
        {props.category && showServices && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            {props.emergencyTypesMap[props.category]?.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleServiceClick(key)}
                className={`p-3 rounded-lg border text-sm transition-all text-left ${
                  props.emergencyType === key
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="text-lg mr-1">{icon}</span>
                <span className="text-slate-700">{label.replace(' Emergency', '')}</span>
              </button>
            ))}
          </div>
        )}
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
