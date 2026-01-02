'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import {
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  FileText,
  User,
  AlertCircle,
  Download,
  Building2,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  ExternalLink,
  Image,
  File,
} from 'lucide-react'

interface ContractorSubmission {
  id: string
  name: string
  email: string
  phone: string | null
  business_name: string | null
  license_number: string | null
  license_file_url: string | null
  insurance_carrier: string | null
  insurance_policy_number: string | null
  insurance_file_url: string | null
  years_experience: number | null
  categories: string[] | null
  specialties: string[] | null
  service_areas: string[] | null
  hourly_rate: number | null
  status: string
  kyc_status: string | null
  created_at: string
  stripe_account_id: string | null
  bio: string | null
  profile_photo_url: string | null
  id_document_url: string | null
  certifications: string[] | null
}

interface KYCDocument {
  id: string
  document_type: string
  document_url: string
  status: string
  created_at: string
  signed_url?: string
}

export default function AdminKYCPage() {
  const [contractors, setContractors] = useState<ContractorSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('pending_approval')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedContractor, setSelectedContractor] = useState<ContractorSubmission | null>(null)
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchContractors()
  }, [statusFilter])

  const fetchContractors = async () => {
    try {
      setLoading(true)

      let query = supabase
        .from('pro_contractors')
        .select('*')
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching contractors:', error)
        setContractors([])
        return
      }

      setContractors(data || [])
    } catch (error) {
      console.error('Error:', error)
      setContractors([])
    } finally {
      setLoading(false)
    }
  }

  const fetchKYCDocuments = async (contractorId: string) => {
    setLoadingDocs(true)
    try {
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

      // Get signed URLs
      const docsWithUrls = await Promise.all(
        (data || []).map(async (doc) => {
          try {
            const filePath = doc.document_url?.split('/kyc-documents/')[1]
            if (filePath) {
              const { data: signedData } = await supabase.storage
                .from('kyc-documents')
                .createSignedUrl(filePath, 3600)
              return { ...doc, signed_url: signedData?.signedUrl || doc.document_url }
            }
            return doc
          } catch {
            return doc
          }
        })
      )

      setKycDocuments(docsWithUrls)
    } catch (error) {
      console.error('Error:', error)
      setKycDocuments([])
    } finally {
      setLoadingDocs(false)
    }
  }

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
          availability: 'online',
          profile_approved_at: new Date().toISOString(),
        })
        .eq('id', contractorId)

      if (error) throw error

      await fetchContractors()
      setSelectedContractor(null)
      alert('Contractor approved!')
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (contractorId: string) => {
    const reason = prompt('Rejection reason:')
    if (!reason) return

    setActionLoading(contractorId)
    try {
      const { error } = await supabase
        .from('pro_contractors')
        .update({
          status: 'rejected',
          rejection_reason: reason,
        })
        .eq('id', contractorId)

      if (error) throw error

      await fetchContractors()
      setSelectedContractor(null)
      alert('Contractor rejected')
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to reject')
    } finally {
      setActionLoading(null)
    }
  }

  const getSignedUrl = async (url: string | null, bucket: string = 'contractor-logos') => {
    if (!url) return null
    try {
      const filePath = url.split(`/${bucket}/`)[1]
      if (filePath) {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600)
        return data?.signedUrl || url
      }
      return url
    } catch {
      return url
    }
  }

  const filteredContractors = contractors.filter(c => {
    const search = searchTerm.toLowerCase()
    return (
      c.name?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search) ||
      c.business_name?.toLowerCase().includes(search)
    )
  })

  const stats = {
    total: contractors.length,
    pending: contractors.filter(c => c.status === 'pending_approval').length,
    approved: contractors.filter(c => c.status === 'approved').length,
    rejected: contractors.filter(c => c.status === 'rejected').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900">
          <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KYC Verification</h1>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Review contractor submissions and documents
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
          <div className="text-sm text-gray-600 dark:text-slate-400">Total</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-sm text-gray-600 dark:text-slate-400">Pending</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          <div className="text-sm text-gray-600 dark:text-slate-400">Approved</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          <div className="text-sm text-gray-600 dark:text-slate-400">Rejected</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Search by name, email, business..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
        >
          <option value="all">All Status</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Contractors List */}
      <div className="space-y-4">
        {filteredContractors.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-lg border p-12 text-center">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-slate-400">No contractors found</p>
          </div>
        ) : (
          filteredContractors.map((contractor) => (
            <div
              key={contractor.id}
              className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {contractor.name}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      contractor.status === 'approved' ? 'bg-green-100 text-green-800' :
                      contractor.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {contractor.status?.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                      <Mail className="h-4 w-4" />
                      {contractor.email}
                    </div>
                    {contractor.phone && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                        <Phone className="h-4 w-4" />
                        {contractor.phone}
                      </div>
                    )}
                    {contractor.business_name && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                        <Building2 className="h-4 w-4" />
                        {contractor.business_name}
                      </div>
                    )}
                    {contractor.license_number && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                        <FileText className="h-4 w-4" />
                        License: {contractor.license_number}
                      </div>
                    )}
                    {contractor.hourly_rate && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                        <DollarSign className="h-4 w-4" />
                        ${contractor.hourly_rate}/hr
                      </div>
                    )}
                    {contractor.service_areas && contractor.service_areas.length > 0 && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                        <MapPin className="h-4 w-4" />
                        {contractor.service_areas.slice(0, 2).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Quick file indicators */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {contractor.profile_photo_url && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs flex items-center gap-1">
                        <Image className="h-3 w-3" /> Photo
                      </span>
                    )}
                    {contractor.license_file_url && (
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs flex items-center gap-1">
                        <File className="h-3 w-3" /> License
                      </span>
                    )}
                    {contractor.insurance_file_url && (
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs flex items-center gap-1">
                        <Shield className="h-3 w-3" /> Insurance
                      </span>
                    )}
                    {contractor.id_document_url && (
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs flex items-center gap-1">
                        <User className="h-3 w-3" /> ID
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-500 mt-3">
                    Applied: {new Date(contractor.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => setSelectedContractor(contractor)}
                    className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium"
                  >
                    Review
                  </button>
                  {contractor.status === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => handleApprove(contractor.id)}
                        disabled={actionLoading === contractor.id}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(contractor.id)}
                        disabled={actionLoading === contractor.id}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedContractor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Contractor Review: {selectedContractor.name}
              </h2>
              <button
                onClick={() => setSelectedContractor(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Profile Photo */}
              {selectedContractor.profile_photo_url && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Profile Photo</h3>
                  <img
                    src={selectedContractor.profile_photo_url}
                    alt="Profile"
                    className="w-32 h-32 object-cover rounded-lg border"
                  />
                </div>
              )}

              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Name:</span> <strong>{selectedContractor.name}</strong></div>
                  <div><span className="text-gray-500">Email:</span> <strong>{selectedContractor.email}</strong></div>
                  <div><span className="text-gray-500">Phone:</span> <strong>{selectedContractor.phone || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Business:</span> <strong>{selectedContractor.business_name || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Experience:</span> <strong>{selectedContractor.years_experience || 'N/A'} years</strong></div>
                  <div><span className="text-gray-500">Hourly Rate:</span> <strong>${selectedContractor.hourly_rate || 'N/A'}/hr</strong></div>
                </div>
              </div>

              {/* License & Insurance */}
              <div>
                <h3 className="text-lg font-semibold mb-3">License & Insurance</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">License #:</span> <strong>{selectedContractor.license_number || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Insurance Carrier:</span> <strong>{selectedContractor.insurance_carrier || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Policy #:</span> <strong>{selectedContractor.insurance_policy_number || 'N/A'}</strong></div>
                </div>

                {/* File Links */}
                <div className="flex gap-3 mt-4">
                  {selectedContractor.license_file_url && (
                    <a
                      href={selectedContractor.license_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" /> View License File
                    </a>
                  )}
                  {selectedContractor.insurance_file_url && (
                    <a
                      href={selectedContractor.insurance_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <Shield className="h-4 w-4" /> View Insurance File
                    </a>
                  )}
                  {selectedContractor.id_document_url && (
                    <a
                      href={selectedContractor.id_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <User className="h-4 w-4" /> View ID Document
                    </a>
                  )}
                </div>
              </div>

              {/* Bio */}
              {selectedContractor.bio && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Bio</h3>
                  <p className="text-sm text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                    {selectedContractor.bio}
                  </p>
                </div>
              )}

              {/* Categories */}
              {selectedContractor.categories && selectedContractor.categories.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Service Categories</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedContractor.categories.map((cat) => (
                      <span key={cat} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Service Areas */}
              {selectedContractor.service_areas && selectedContractor.service_areas.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Service Areas</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedContractor.service_areas.map((area) => (
                      <span key={area} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* KYC Documents from kyc_documents table */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Uploaded KYC Documents</h3>
                {loadingDocs ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-600">Loading documents...</span>
                  </div>
                ) : kycDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {kycDocuments.map((doc) => (
                      <div key={doc.id} className="border rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <div className="font-medium capitalize">{doc.document_type.replace('_', ' ')}</div>
                          <div className="text-xs text-gray-500">
                            Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                          </div>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                            doc.status === 'verified' ? 'bg-green-100 text-green-700' :
                            doc.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {doc.status}
                          </span>
                        </div>
                        {doc.signed_url && (
                          <a
                            href={doc.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm flex items-center gap-1"
                          >
                            <ExternalLink className="h-4 w-4" /> View
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">No additional KYC documents uploaded</p>
                )}
              </div>

              {/* Stripe */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Payment Setup</h3>
                {selectedContractor.stripe_account_id ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <span>Stripe Connected: {selectedContractor.stripe_account_id}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertCircle className="h-5 w-5" />
                    <span>No Stripe account connected</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selectedContractor.status === 'pending_approval' && (
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => handleApprove(selectedContractor.id)}
                    disabled={actionLoading === selectedContractor.id}
                    className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="h-5 w-5" /> Approve Contractor
                  </button>
                  <button
                    onClick={() => handleReject(selectedContractor.id)}
                    disabled={actionLoading === selectedContractor.id}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <XCircle className="h-5 w-5" /> Reject Application
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
