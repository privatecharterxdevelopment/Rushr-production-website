'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { Capacitor } from '@capacitor/core'
import { safeBack } from '../../../lib/safeBack'
import {
  Upload,
  FileText,
  Shield,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Camera,
  CreditCard,
  Home,
  User
} from 'lucide-react'
import { FullScreenLoading } from '../../../components/LoadingSpinner'

// Hook to safely check if running in native app (avoids hydration mismatch)
function useIsNative() {
  const [isNative, setIsNative] = React.useState(false)
  React.useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

type DocumentType = 'drivers_license' | 'passport' | 'utility_bill' | 'bank_statement'

interface KYCDocument {
  type: DocumentType
  file: File | null
  uploaded: boolean
  verified: boolean
  status?: 'pending' | 'under_review' | 'verified' | 'rejected'
  documentUrl?: string
  rejectionReason?: string
}

export default function KYCVerificationPage() {
  const { user, userProfile, refreshProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const isNative = useIsNative()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [documents, setDocuments] = useState<KYCDocument[]>([
    { type: 'drivers_license', file: null, uploaded: false, verified: false },
    { type: 'passport', file: null, uploaded: false, verified: false },
    { type: 'utility_bill', file: null, uploaded: false, verified: false },
    { type: 'bank_statement', file: null, uploaded: false, verified: false },
  ])
  const [showKYCForm, setShowKYCForm] = useState(false)

  // Define fetchExistingDocuments before useEffect
  const fetchExistingDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_documents')
        .select('*')
        .eq('user_id', user!.id)

      if (error) {
        // Silently fail if table doesn't exist yet (migration not run)
        console.log('KYC documents table not accessible:', error.message)
        return
      }

      if (data && data.length > 0) {
        setDocuments(prev => prev.map(doc => {
          const existingDoc = data.find(d => d.document_type === doc.type)
          if (existingDoc) {
            return {
              ...doc,
              uploaded: true,
              verified: existingDoc.status === 'verified',
              status: existingDoc.status,
              documentUrl: existingDoc.document_url,
              rejectionReason: existingDoc.rejection_reason
            }
          }
          return doc
        }))

        // Check if all documents are verified - update user profile
        const allVerified = data.every(d => d.status === 'verified')
        const hasAtLeastTwo = data.filter(d => d.status === 'verified').length >= 2

        if (hasAtLeastTwo && !userProfile?.kyc_verified) {
          // Update user profile to mark KYC as verified
          await supabase
            .from('user_profiles')
            .update({ kyc_verified: true })
            .eq('id', user!.id)

          // Refresh profile to update UI
          if (refreshProfile) await refreshProfile()
        }
      }
    } catch (err: any) {
      // Silently fail - KYC documents are optional
      console.log('KYC documents fetch failed:', err?.message || 'Unknown error')
    }
  }

  // Fetch existing KYC documents on mount
  useEffect(() => {
    if (user) {
      fetchExistingDocuments()
    }
  }, [user])

  // Show full-screen loading while auth is loading
  if (authLoading) {
    return <FullScreenLoading />
  }

  if (!user || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Please sign in to access KYC verification</h2>
          <Link href="/?auth=signin" className="btn-primary">Sign In</Link>
        </div>
      </div>
    )
  }

  // Show homeowner notice that KYC is optional
  if (userProfile.role === 'homeowner' && !showKYCForm) {
    return (
      <div
        className="min-h-screen bg-slate-50 dark:bg-slate-900"
        style={{
          paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
          paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
        }}
      >
        {/* iOS Native Header */}
        {isNative && (
          <div
            className="sticky top-0 z-50"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
            }}
          >
            <div className="flex items-center px-4 py-3">
              <button
                onClick={() => safeBack(router, '/dashboard')}
                className="flex items-center text-white active:opacity-60"
              >
                <ArrowLeft className="w-6 h-6" />
                <span className="ml-1 font-medium">Back</span>
              </button>
              <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
                KYC Verification
              </h1>
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            {!isNative && (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-xl p-8 border border-slate-200 dark:border-slate-700 text-center">
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900 w-fit mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">KYC Not Required</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                As a homeowner, identity verification is not required. You can access all homeowner features without KYC verification.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/dashboard"
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  Return to Dashboard
                </Link>
                <button
                  onClick={() => setShowKYCForm(true)}
                  className="border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  Complete KYC Anyway (Optional)
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Optional KYC verification may unlock additional features in the future.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const getDocumentLabel = (type: DocumentType) => {
    switch (type) {
      case 'drivers_license': return "Driver's License"
      case 'passport': return 'Passport'
      case 'utility_bill': return 'Utility Bill'
      case 'bank_statement': return 'Bank Statement'
    }
  }

  const getDocumentIcon = (type: DocumentType) => {
    switch (type) {
      case 'drivers_license': return <CreditCard className="h-5 w-5" />
      case 'passport': return <FileText className="h-5 w-5" />
      case 'utility_bill': return <Home className="h-5 w-5" />
      case 'bank_statement': return <FileText className="h-5 w-5" />
    }
  }

  const handleFileSelect = (type: DocumentType, file: File) => {
    setDocuments(prev => prev.map(doc =>
      doc.type === type ? { ...doc, file } : doc
    ))
  }

  const uploadDocument = async (type: DocumentType) => {
    const doc = documents.find(d => d.type === type)
    if (!doc?.file) return

    setLoading(true)
    setError(null)

    try {
      const fileExt = doc.file.name.split('.').pop()
      const fileName = `${user.id}/${type}_${Date.now()}.${fileExt}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, doc.file)

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(fileName)

      // Save to database
      const { error: dbError } = await supabase
        .from('kyc_documents')
        .insert({
          user_id: user.id,
          document_type: type,
          document_url: urlData.publicUrl,
          status: 'pending'
        })

      if (dbError) {
        throw dbError
      }

      // Update local state
      setDocuments(prev => prev.map(d =>
        d.type === type ? {
          ...d,
          uploaded: true,
          status: 'pending',
          documentUrl: urlData.publicUrl
        } : d
      ))

      setSuccess(`${getDocumentLabel(type)} uploaded successfully! Pending admin review.`)

      // Refresh documents to get latest status
      await fetchExistingDocuments()
    } catch (err: any) {
      setError(err.message || 'Failed to upload document')
    } finally {
      setLoading(false)
    }
  }

  const completedDocuments = documents.filter(d => d.uploaded).length
  const totalDocuments = documents.length
  const completionPercentage = Math.round((completedDocuments / totalDocuments) * 100)

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-900"
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
      }}
    >
      {/* iOS Native Header */}
      {isNative && (
        <div
          className="sticky top-0 z-50"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
          }}
        >
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => safeBack(router, '/dashboard')}
              className="flex items-center text-white active:opacity-60"
            >
              <ArrowLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Back</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              KYC Verification
            </h1>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          {!isNative && (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Identity Verification (KYC)</h1>
              <p className="text-slate-600 dark:text-slate-400">
                {userProfile.role === 'contractor'
                  ? 'Required for contractors to accept jobs and receive payments'
                  : 'Optional verification to unlock additional features'
                }
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Verification Progress</span>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {completedDocuments} of {totalDocuments} documents uploaded
            </p>
          </div>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="text-green-700 dark:text-green-300">{success}</span>
          </div>
        )}

        {/* Requirements */}
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
          <h2 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
            {userProfile.role === 'contractor' ? 'Required Documents' : 'Optional Documents'}
          </h2>
          <p className="text-blue-800 dark:text-blue-200 text-sm mb-4">
            {userProfile.role === 'contractor'
              ? 'To accept jobs and receive payments as a contractor, please upload at least 2 of the following documents:'
              : 'To complete optional identity verification, please upload at least 2 of the following documents:'
            }
          </p>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
              Government-issued photo ID (Driver's License or Passport)
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
              Proof of address (Utility Bill or Bank Statement - dated within 3 months)
            </li>
          </ul>
        </div>

        {/* Document Upload Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {documents.map((doc) => (
            <div key={doc.type} className={`bg-white dark:bg-slate-800 rounded-xl p-6 ${
              doc.status === 'verified'
                ? 'border-2 border-green-500 dark:border-green-600'
                : 'border border-slate-200 dark:border-slate-700'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${
                  doc.status === 'verified'
                    ? 'bg-green-100 dark:bg-green-900'
                    : doc.uploaded
                      ? 'bg-yellow-100 dark:bg-yellow-900'
                      : 'bg-slate-100 dark:bg-slate-700'
                }`}>
                  {doc.status === 'verified' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : doc.uploaded ? (
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  ) : (
                    getDocumentIcon(doc.type)
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{getDocumentLabel(doc.type)}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {doc.status === 'verified'
                      ? '✓ Verified & Approved'
                      : doc.uploaded
                        ? 'Pending Review'
                        : 'Required for verification'
                    }
                  </p>
                </div>
              </div>

              {doc.uploaded ? (
                <div>
                  {/* Verified Status - Green */}
                  {doc.status === 'verified' && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-2 border-green-500 dark:border-green-600">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-bold">✓ VERIFIED & APPROVED</span>
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        This document has been verified by our admin team
                      </p>
                    </div>
                  )}

                  {/* Pending/Under Review Status - Yellow */}
                  {(doc.status === 'pending' || doc.status === 'under_review') && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Document uploaded - pending review</span>
                      </div>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        Under review - you'll be notified once verified (1-2 business days)
                      </p>
                    </div>
                  )}

                  {/* Rejected Status - Red */}
                  {doc.status === 'rejected' && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Document rejected</span>
                      </div>
                      {doc.rejectionReason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Reason: {doc.rejectionReason}
                        </p>
                      )}
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Please upload a new document
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileSelect(doc.type, file)
                      }}
                      className="hidden"
                      id={`file-${doc.type}`}
                    />
                    <label htmlFor={`file-${doc.type}`} className="cursor-pointer">
                      <Upload className="h-8 w-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                        {doc.file ? doc.file.name : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        PNG, JPG or PDF (max 10MB)
                      </p>
                    </label>
                  </div>

                  {doc.file && (
                    <button
                      onClick={() => uploadDocument(doc.type)}
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <img
                          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                          alt="Loading..."
                          className="w-4 h-4 object-contain"
                        />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload Document
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Need Help?</h3>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p>• Documents must be clear and readable</p>
            <p>• Ensure all four corners of the document are visible</p>
            <p>• Personal information must be visible and match your profile</p>
            <p>• Verification typically takes 1-2 business days</p>
          </div>
          <div className="mt-4">
            <Link href="/contact" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
              Contact Support →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}