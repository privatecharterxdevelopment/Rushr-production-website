'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Mail,
  Phone,
  Building2,
  FileText,
  ExternalLink,
  AlertCircle,
  Shield,
  Star,
  DollarSign,
} from 'lucide-react'

type PendingContractor = {
  id: string
  name: string
  email: string
  phone: string | null
  business_name: string | null
  license_number: string | null
  insurance_carrier: string | null
  insurance_policy_number: string | null
  years_experience: number | null
  categories: string[] | null
  specialties: string[] | null
  service_areas: string[] | null
  hourly_rate: number | null
  status: string
  kyc_status: string
  created_at: string
  stripe_account_id: string | null
  bio: string | null
}

type KYCDocument = {
  id: string
  document_type: string
  document_url: string
  status: string
  created_at: string
  rejection_reason?: string
  signed_url?: string
}

export default function ContractorApprovalsPage() {
  const [contractors, setContractors] = useState<PendingContractor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedContractor, setSelectedContractor] = useState<PendingContractor | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending_approval' | 'all'>('pending_approval')
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  const fetchContractors = async () => {
    try {
      let query = supabase
        .from('pro_contractors')
        .select('*')
        .order('created_at', { ascending: false })

      if (filter === 'pending_approval') {
        query = query.eq('status', 'pending_approval')
      }

      const { data, error } = await query

      if (error) throw error

      // Filter out specific contractors (muhammad rehan, abbasprogrammer)
      const filtered = (data || []).filter(contractor => {
        const email = contractor.email?.toLowerCase() || ''
        const name = contractor.name?.toLowerCase() || ''
        const businessName = contractor.business_name?.toLowerCase() || ''

        // Hide if email or name contains these keywords
        const hideKeywords = ['muhammad', 'rehan', 'abbas', 'pasha', 'madan', 'bhanani']
        return !hideKeywords.some(keyword =>
          email.includes(keyword) || name.includes(keyword) || businessName.includes(keyword)
        )
      })

      setContractors(filtered)
    } catch (error) {
      console.error('Error fetching contractors:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchKYCDocuments = async (contractorId: string) => {
    setLoadingDocs(true)
    try {
      // Fetch KYC documents from database
      const { data, error } = await supabase
        .from('kyc_documents')
        .select('*')
        .eq('user_id', contractorId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching KYC documents:', error)
        setKycDocuments([])
        return
      }

      // Fetch signed URLs for each document
      const documentsWithUrls = await Promise.all(
        (data || []).map(async (doc) => {
          try {
            // Extract file path from document_url
            // Format is typically: kyc-documents/user-id/filename
            const filePath = doc.document_url.split('/kyc-documents/')[1]

            if (filePath) {
              const { data: signedUrlData } = await supabase.storage
                .from('kyc-documents')
                .createSignedUrl(filePath, 3600) // 1 hour expiry

              return {
                ...doc,
                signed_url: signedUrlData?.signedUrl || doc.document_url
              }
            }
            return doc
          } catch (err) {
            console.error('Error fetching signed URL for document:', err)
            return doc
          }
        })
      )

      setKycDocuments(documentsWithUrls as KYCDocument[])
    } catch (error) {
      console.error('Error in fetchKYCDocuments:', error)
      setKycDocuments([])
    } finally {
      setLoadingDocs(false)
    }
  }

  useEffect(() => {
    fetchContractors()

    // Real-time subscription
    const subscription = supabase
      .channel('contractor-approvals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pro_contractors',
        },
        () => {
          fetchContractors()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [filter])

  // Fetch KYC documents when contractor is selected
  useEffect(() => {
    if (selectedContractor) {
      fetchKYCDocuments(selectedContractor.id)
    } else {
      setKycDocuments([])
    }
  }, [selectedContractor])

  const handleApprove = async (contractorId: string) => {
    setActionLoading(contractorId)
    try {
      const { error } = await supabase
        .from('pro_contractors')
        .update({
          status: 'approved',
          kyc_status: 'completed',
          availability: 'online',  // Auto-switch to online when approved
          profile_approved_at: new Date().toISOString(),
        })
        .eq('id', contractorId)

      if (error) throw error

      // Refresh list
      await fetchContractors()
      setSelectedContractor(null)

      // Show success notification (you can add toast here)
      alert('Contractor approved successfully and set to ONLINE!')
    } catch (error) {
      console.error('Error approving contractor:', error)
      alert('Failed to approve contractor. Check console for details.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (contractorId: string) => {
    const reason = prompt('Please enter rejection reason (optional):')

    setActionLoading(contractorId)
    try {
      const { error } = await supabase
        .from('pro_contractors')
        .update({
          status: 'rejected',
          rejection_reason: reason || 'Application rejected by admin',
        })
        .eq('id', contractorId)

      if (error) throw error

      // Refresh list
      await fetchContractors()
      setSelectedContractor(null)

      alert('Contractor rejected.')
    } catch (error) {
      console.error('Error rejecting contractor:', error)
      alert('Failed to reject contractor. Check console for details.')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'approved':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'rejected':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'suspended':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Loading contractors..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contractor Approvals</h1>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
            Review and approve contractor applications
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('pending_approval')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'pending_approval'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Pending ({contractors.filter((c) => c.status === 'pending_approval').length})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            All Contractors
          </button>
        </div>
      </div>

      {/* Contractors List */}
      {contractors.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-12 text-center">
          <Clock className="h-12 w-12 text-gray-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No contractors to review
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            All caught up! New applications will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {contractors.map((contractor) => (
            <div
              key={contractor.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {contractor.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        contractor.status
                      )}`}
                    >
                      {contractor.status.replace('_', ' ')}
                    </span>
                    {contractor.kyc_status && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        KYC: {contractor.kyc_status.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-slate-400">
                    {contractor.business_name && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span>{contractor.business_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{contractor.email}</span>
                    </div>
                    {contractor.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{contractor.phone}</span>
                      </div>
                    )}
                    {contractor.license_number && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>License: {contractor.license_number}</span>
                      </div>
                    )}
                    {contractor.service_areas && contractor.service_areas.length > 0 && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{contractor.service_areas.join(', ')}</span>
                      </div>
                    )}
                    {contractor.hourly_rate && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        <span>${contractor.hourly_rate}/hr</span>
                      </div>
                    )}
                  </div>

                  {contractor.categories && contractor.categories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contractor.categories.map((category) => (
                        <span
                          key={category}
                          className="px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-gray-500 dark:text-slate-500">
                    Applied: {new Date(contractor.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => setSelectedContractor(contractor)}
                    className="px-3 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    View Details
                  </button>
                  {contractor.status === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => handleApprove(contractor.id)}
                        disabled={actionLoading === contractor.id}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                      >
                        {actionLoading === contractor.id ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleReject(contractor.id)}
                        disabled={actionLoading === contractor.id}
                        className="px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedContractor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Contractor Details
              </h2>
              <button
                onClick={() => setSelectedContractor(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-slate-400">Name:</span>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-slate-400">Email:</span>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.email}</p>
                  </div>
                  {selectedContractor.phone && (
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Phone:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.phone}</p>
                    </div>
                  )}
                  {selectedContractor.business_name && (
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Business Name:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.business_name}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Credentials */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Credentials
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedContractor.license_number && (
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">License Number:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.license_number}</p>
                    </div>
                  )}
                  {selectedContractor.insurance_carrier && (
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Insurance Carrier:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.insurance_carrier}</p>
                    </div>
                  )}
                  {selectedContractor.insurance_policy_number && (
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Policy Number:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.insurance_policy_number}</p>
                    </div>
                  )}
                  {selectedContractor.years_experience && (
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Years Experience:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedContractor.years_experience} years</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bio */}
              {selectedContractor.bio && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Bio</h3>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{selectedContractor.bio}</p>
                </div>
              )}

              {/* Services */}
              {selectedContractor.categories && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Service Categories
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedContractor.categories.map((category) => (
                      <span
                        key={category}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stripe Status */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Payment Setup
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  {selectedContractor.stripe_account_id ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                      <span className="text-gray-900 dark:text-white">Stripe Connected</span>
                      <span className="text-gray-500 dark:text-slate-400">
                        ({selectedContractor.stripe_account_id})
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <span className="text-gray-900 dark:text-white">No Stripe account</span>
                    </>
                  )}
                </div>
              </div>

              {/* KYC Documents */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  KYC Documents
                </h3>
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="sm" />
                    <span className="ml-2 text-sm text-gray-600 dark:text-slate-400">Loading documents...</span>
                  </div>
                ) : kycDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {kycDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="border border-gray-200 dark:border-slate-700 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="h-4 w-4 text-gray-600 dark:text-slate-400" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                                {doc.document_type.replace('_', ' ')}
                              </span>
                            </div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                doc.status === 'verified'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : doc.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : doc.status === 'under_review'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {doc.status}
                            </span>
                          </div>
                          {doc.signed_url && (
                            <a
                              href={doc.signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </a>
                          )}
                        </div>
                        {doc.rejection_reason && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">
                            Rejection reason: {doc.rejection_reason}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                          Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <FileText className="h-8 w-8 text-gray-400 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-slate-400">No KYC documents uploaded yet</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selectedContractor.status === 'pending_approval' && (
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                  <button
                    onClick={() => handleApprove(selectedContractor.id)}
                    disabled={actionLoading === selectedContractor.id}
                    className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {actionLoading === selectedContractor.id ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Approve Contractor
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleReject(selectedContractor.id)}
                    disabled={actionLoading === selectedContractor.id}
                    className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle className="h-5 w-5" />
                    Reject Application
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
