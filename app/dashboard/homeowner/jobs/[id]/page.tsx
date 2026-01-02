'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../../../../contexts/AuthContext'
import { supabase } from '../../../../../lib/supabaseClient'
import dynamic from 'next/dynamic'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { ArrowLeft, MapPin, Clock, DollarSign, User, Phone, Mail, AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'

// Dynamic imports for real-time components
const LiveTrackingMap = dynamic(() => import('../../../../../components/LiveTrackingMap'), { ssr: false })
const JobChat = dynamic(() => import('../../../../../components/JobChat'), { ssr: false })

export default function JobDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [job, setJob] = useState<any>(null)
  const [contractor, setContractor] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [homeownerLocation, setHomeownerLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeDescription, setDisputeDescription] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)

  const jobId = params.id as string

  useEffect(() => {
    if (!user || !jobId) return

    const fetchJobDetails = async () => {
      try {
        // Fetch job details
        const { data: jobData, error: jobError } = await supabase
          .from('homeowner_jobs')
          .select('*')
          .eq('id', jobId)
          .eq('homeowner_id', user.id)
          .single()

        if (jobError) {
          console.error('Error fetching job:', jobError)
          return
        }

        setJob(jobData)

        // Get homeowner location from job
        if (jobData.latitude && jobData.longitude) {
          setHomeownerLocation({
            lat: jobData.latitude,
            lng: jobData.longitude
          })
        }

        // If job has a contractor assigned, fetch contractor details
        if (jobData.contractor_id) {
          const { data: contractorData, error: contractorError } = await supabase
            .from('pro_contractors')
            .select('id, name, business_name, phone, email')
            .eq('id', jobData.contractor_id)
            .single()

          if (contractorError) {
            console.error('Error fetching contractor:', contractorError)
          } else {
            setContractor(contractorData)
          }
        }
      } catch (error) {
        console.error('Error loading job details:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchJobDetails()
  }, [user, jobId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg"  />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Job not found</h2>
          <Link href="/dashboard/homeowner" className="btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmitDispute = async () => {
    if (!disputeReason || !user) return

    setSubmittingDispute(true)
    try {
      const response = await fetch('/api/disputes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          reason: disputeReason,
          description: disputeDescription,
          userId: user.id,
          userType: 'homeowner'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(`Error: ${data.error}`)
        return
      }

      alert('Dispute filed successfully. Our admin team will review it.')
      setShowDisputeModal(false)
      setDisputeReason('')
      setDisputeDescription('')
      // Refresh job data
      router.refresh()
    } catch (err) {
      console.error('Error submitting dispute:', err)
      alert('Failed to submit dispute')
    } finally {
      setSubmittingDispute(false)
    }
  }

  const isJobActive = job.status === 'bid_accepted' || job.status === 'in_progress' || job.status === 'confirmed'
  const canFileDispute = job.status === 'in_progress'
  const showFullDetails = isJobActive
  const showChat = isJobActive && contractor
  const showTracking = isJobActive && contractor && job.latitude && job.longitude

  return (
    <div className="container-max py-8 space-y-6">
      {/* Back Button */}
      <Link
        href="/dashboard/homeowner"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Job Header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{job.title}</h1>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                job.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                job.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                job.status === 'in_progress' ? 'bg-purple-100 text-purple-800' :
                job.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                'bg-slate-100 text-slate-800'
              }`}>
                {job.status.replace('_', ' ').toUpperCase()}
              </span>
              {job.priority === 'emergency' && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                  🚨 EMERGENCY
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            {job.final_cost && (
              <div className="text-2xl font-bold text-emerald-600">
                ${job.final_cost.toFixed(2)}
              </div>
            )}
            <div className="text-sm text-slate-500">
              Posted {new Date(job.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Job Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-slate-700">Location</div>
              {showFullDetails ? (
                <div className="text-slate-900">{job.address || 'Not specified'}</div>
              ) : (
                <div className="text-slate-600">
                  {job.location_zip ? `${job.location_zip} area` : 'Address will be revealed when job is accepted'}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-slate-700">Category</div>
              <div className="text-slate-900">{job.category || 'General'}</div>
            </div>
          </div>

          {job.description && (
            <div className="md:col-span-2">
              <div className="text-sm font-medium text-slate-700 mb-1">Description</div>
              <div className="text-slate-900 bg-slate-50 p-3 rounded-lg">
                {job.description}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contractor Info */}
      {contractor && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Assigned Contractor</h2>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
              {contractor.name?.[0] || 'C'}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">{contractor.business_name || contractor.name}</h3>
              {showFullDetails ? (
                <div className="flex flex-col gap-2 mt-2 text-sm text-slate-600">
                  {contractor.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <a href={`tel:${contractor.phone}`} className="hover:text-blue-600">
                        {contractor.phone}
                      </a>
                    </div>
                  )}
                  {contractor.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <a href={`mailto:${contractor.email}`} className="hover:text-blue-600">
                        {contractor.email}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500 italic">
                  Contact details will be revealed when job is accepted
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Issue / Dispute Button */}
      {canFileDispute && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-slate-900">Having issues with this job?</h3>
              <p className="text-sm text-slate-500">File a dispute to put the job on hold while our team reviews</p>
            </div>
            <button
              onClick={() => setShowDisputeModal(true)}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Report Issue
            </button>
          </div>
        </div>
      )}

      {/* On Hold Status */}
      {job.status === 'on_hold' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Job On Hold</h3>
              <p className="text-sm text-red-700">A dispute has been filed for this job. Our admin team is reviewing the case.</p>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Tracking & Chat Section */}
      {showTracking && (
        <div className="bg-white rounded-lg border border-slate-200 p-6" style={{ height: '600px' }}>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">📍 Live Location Tracking</h2>
          <LiveTrackingMap
            jobId={jobId}
            jobAddress={job.address}
            jobLatitude={job.latitude}
            jobLongitude={job.longitude}
            contractorName={contractor.business_name || contractor.name}
            onArrival={() => {
              console.log('Contractor has arrived!')
            }}
          />
        </div>
      )}

      {/* Live Chat */}
      {showChat && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">💬 Live Chat</h2>
          <JobChat
            jobId={jobId}
            contractorName={contractor.business_name || contractor.name}
            homeownerName={user.email?.split('@')[0] || 'You'}
          />
        </div>
      )}

      {/* Waiting for Contractor Message */}
      {!contractor && job.status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <div className="text-amber-800">
            <Clock className="w-12 h-12 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">Finding a Contractor</h3>
            <p className="text-sm">
              We're matching you with available contractors in your area. You'll be notified when one accepts your job.
            </p>
          </div>
        </div>
      )}

      {/* Chat Available Soon Message */}
      {!showChat && contractor && job.status === 'pending' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="text-blue-800">
            <User className="w-12 h-12 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">Contractor Assigned!</h3>
            <p className="text-sm">
              Chat and tracking will be available once the contractor confirms the job.
            </p>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900">Report an Issue</h2>
              <button onClick={() => setShowDisputeModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Note:</strong> Filing a dispute will put this job on hold. Payment will be frozen until our admin team resolves the issue.
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Reason for Dispute *</label>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a reason...</option>
                  <option value="Work not completed">Work not completed</option>
                  <option value="Quality issues">Quality issues</option>
                  <option value="Contractor no-show">Contractor no-show</option>
                  <option value="Price disagreement">Price disagreement</option>
                  <option value="Safety concern">Safety concern</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description (Optional)</label>
                <textarea
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Provide details about the issue..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDisputeModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDispute}
                  disabled={!disputeReason || submittingDispute}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg font-medium"
                >
                  {submittingDispute ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
