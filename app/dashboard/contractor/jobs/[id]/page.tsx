'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProAuth } from '../../../../../contexts/ProAuthContext'
import { supabase } from '../../../../../lib/supabaseClient'
import dynamic from 'next/dynamic'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { ArrowLeft, MapPin, Clock, DollarSign, User, Phone, Mail, Navigation, CheckCircle, Send, MessageSquare, AlertCircle } from 'lucide-react'
import Link from 'next/link'

// Dynamic imports
const JobChat = dynamic(() => import('../../../../../components/JobChat'), { ssr: false })
const ContractorNavigationMap = dynamic(() => import('../../../../../components/ContractorNavigationMap'), { ssr: false })

export default function ContractorJobDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user, contractorProfile } = useProAuth()
  const [job, setJob] = useState<any>(null)
  const [homeowner, setHomeowner] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [markingComplete, setMarkingComplete] = useState(false)

  // Bidding state
  const [bidAmount, setBidAmount] = useState('')
  const [bidMessage, setBidMessage] = useState('')
  const [submittingBid, setSubmittingBid] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

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
          .single()

        if (jobError) {
          console.error('Error fetching job:', jobError)
          return
        }

        setJob(jobData)

        // Check if contractor has already bid on this job (optional - just for display)
        const { data: bidData } = await supabase
          .from('job_bids')
          .select('*')
          .eq('job_id', jobId)
          .eq('contractor_id', user.id)
          .maybeSingle()

        if (bidData) {
          // Contractor has a bid on this job - show bid status
          setJob((prev: any) => ({ ...prev, myBid: bidData }))
        }

        // Fetch homeowner details
        if (jobData.homeowner_id) {
          const { data: homeownerData, error: homeownerError } = await supabase
            .from('user_profiles')
            .select('name, phone, email')
            .eq('id', jobData.homeowner_id)
            .single()

          if (homeownerError) {
            console.error('Error fetching homeowner:', homeownerError)
          } else {
            setHomeowner(homeownerData)
          }
        }
      } catch (error) {
        console.error('Error loading job details:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchJobDetails()
  }, [user, jobId, router])

  const openInMaps = () => {
    if (!job?.address) return

    const address = encodeURIComponent(job.address)
    const url = `https://maps.google.com/?q=${address}`
    window.open(url, '_blank')
  }

  const markJobAsComplete = async () => {
    if (!user || !jobId) return

    if (!confirm('Are you sure you want to mark this job as complete? This will notify the homeowner and trigger payment once they approve.')) {
      return
    }

    setMarkingComplete(true)

    try {
      // Update job status to 'completed' and mark contractor_marked_complete
      const { error } = await supabase
        .from('homeowner_jobs')
        .update({
          status: 'completed',
          contractor_marked_complete: true,
          completed_date: new Date().toISOString()
        })
        .eq('id', jobId)

      if (error) {
        console.error('Error marking job as complete:', error)
        setSuccessMessage('Failed to mark job as complete. Please try again.')
        setShowSuccessModal(true)
      } else {
        setSuccessMessage('Job marked as complete! The homeowner will review and release payment.')
        setShowSuccessModal(true)
        // Refresh job data after modal is shown
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (err) {
      console.error('Error marking job as complete:', err)
      setSuccessMessage('Failed to mark job as complete. Please try again.')
      setShowSuccessModal(true)
    } finally {
      setMarkingComplete(false)
    }
  }

  const handleSubmitBid = async () => {
    // Check if contractor is approved
    if (!contractorProfile || contractorProfile.status !== 'approved') {
      setSuccessMessage('You must be approved by an administrator before you can place bids. Please wait for approval or contact support.')
      setShowSuccessModal(true)
      return
    }

    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      setSuccessMessage('Please enter a valid bid amount')
      setShowSuccessModal(true)
      return
    }

    if (!user || !jobId) return

    setSubmittingBid(true)

    try {
      const { error } = await supabase
        .from('job_bids')
        .insert([{
          job_id: jobId,
          contractor_id: user.id,
          homeowner_id: job.homeowner_id,
          bid_amount: parseFloat(bidAmount),
          description: bidMessage || '',
          status: 'pending'
        }])

      if (error) {
        console.error('Error submitting bid:', error)

        // Check if it's a duplicate bid error
        if (error.message.includes('duplicate key') || error.message.includes('job_bids_job_id_contractor_id_key')) {
          setSuccessMessage('You have already submitted a bid for this job. Your bid is awaiting approval from the homeowner. You can message them in the Messages section.')
        } else {
          setSuccessMessage('Failed to submit bid. Please try again.')
        }
        setShowSuccessModal(true)
      } else {
        setSuccessMessage(`Bid of $${parseFloat(bidAmount).toFixed(2)} submitted successfully! The homeowner will be notified.`)
        setShowSuccessModal(true)
        // Redirect after modal is shown
        setTimeout(() => {
          router.push('/dashboard/contractor/jobs?tab=my-jobs')
        }, 2000)
      }
    } catch (err: any) {
      console.error('Error submitting bid:', err)

      // Check if it's a duplicate bid error
      const errorMsg = err?.message || ''
      if (errorMsg.includes('duplicate key') || errorMsg.includes('job_bids_job_id_contractor_id_key')) {
        setSuccessMessage('You have already submitted a bid for this job. Your bid is awaiting approval from the homeowner. You can message them in the Messages section.')
      } else {
        setSuccessMessage('Failed to submit bid. Please try again.')
      }
      setShowSuccessModal(true)
    } finally {
      setSubmittingBid(false)
    }
  }

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
          <Link href="/dashboard/contractor" className="btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const isJobActive = job.status === 'bid_accepted' || job.status === 'confirmed' || job.status === 'in_progress'
  const showFullDetails = isJobActive
  const showChat = isJobActive && homeowner
  const showNavigation = isJobActive && job.latitude && job.longitude

  return (
    <div className="container-max py-8 space-y-6">
      {/* Back Button */}
      <Link
        href="/dashboard/contractor"
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
              <div className="text-2xl font-bold text-blue-600">
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
                <>
                  <div className="text-slate-900">{job.address || 'Not specified'}</div>
                  {job.address && (
                    <button
                      onClick={openInMaps}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Navigation className="w-4 h-4" />
                      Open in Google Maps
                    </button>
                  )}
                </>
              ) : (
                <div className="text-slate-600">
                  {job.location_zip ? `${job.location_zip} area` : 'Address will be revealed when you accept the job'}
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

      {/* Homeowner Info */}
      {homeowner && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Homeowner Information</h2>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold">
              {homeowner.name?.[0] || 'H'}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">{homeowner.name || 'Homeowner'}</h3>
              {showFullDetails ? (
                <div className="flex flex-col gap-2 mt-2 text-sm text-slate-600">
                  {homeowner.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <a href={`tel:${homeowner.phone}`} className="hover:text-blue-600">
                        {homeowner.phone}
                      </a>
                    </div>
                  )}
                  {homeowner.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <a href={`mailto:${homeowner.email}`} className="hover:text-blue-600">
                        {homeowner.email}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500 italic">
                  Contact details will be revealed when you accept the job
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bidding Section - Show if contractor hasn't bid yet */}
      {!job.myBid && job.status === 'pending' && (
        <div className="bg-white rounded-lg border border-blue-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Submit Your Bid</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Your Bid Amount ($) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Message to Homeowner (Optional)
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <textarea
                  placeholder="Add a message to the homeowner..."
                  value={bidMessage}
                  onChange={(e) => setBidMessage(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                />
              </div>
            </div>

            <button
              onClick={handleSubmitBid}
              disabled={submittingBid || !bidAmount}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              {submittingBid ? 'Submitting Bid...' : 'Submit Bid'}
            </button>
          </div>
        </div>
      )}

      {/* Show Bid Status if contractor already bid */}
      {job.myBid && (
        <div className={`rounded-lg border p-6 ${
          job.myBid.status === 'accepted' ? 'bg-emerald-50 border-emerald-200' :
          job.myBid.status === 'rejected' ? 'bg-red-50 border-red-200' :
          'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`h-6 w-6 mt-0.5 ${
              job.myBid.status === 'accepted' ? 'text-emerald-600' :
              job.myBid.status === 'rejected' ? 'text-red-600' :
              'text-amber-600'
            }`} />
            <div>
              <h3 className={`font-semibold mb-1 ${
                job.myBid.status === 'accepted' ? 'text-emerald-900' :
                job.myBid.status === 'rejected' ? 'text-red-900' :
                'text-amber-900'
              }`}>
                {job.myBid.status === 'accepted' ? '✅ Your Bid Was Accepted!' :
                 job.myBid.status === 'rejected' ? '❌ Your Bid Was Not Accepted' :
                 '⏳ Your Bid Is Pending'}
              </h3>
              <p className={`text-sm ${
                job.myBid.status === 'accepted' ? 'text-emerald-800' :
                job.myBid.status === 'rejected' ? 'text-red-800' :
                'text-amber-800'
              }`}>
                Your bid: <strong>${job.myBid.bid_amount?.toFixed(2)}</strong>
                {job.myBid.status === 'pending' && ' - Waiting for homeowner to review'}
                {job.myBid.status === 'rejected' && ' - The homeowner chose another contractor'}
              </p>
              {job.myBid.description && (
                <p className="text-sm text-slate-600 mt-2 italic">
                  Your message: "{job.myBid.description}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Map */}
      {showNavigation && (
        <div className="bg-white rounded-lg border border-slate-200 p-6" style={{ height: '600px' }}>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">🧭 Navigate to Job</h2>
          <ContractorNavigationMap
            jobId={jobId}
            jobAddress={job.address}
            jobLatitude={job.latitude}
            jobLongitude={job.longitude}
            contractorId={user?.id || ''}
            onNavigationStart={() => {
              console.log('Navigation started')
            }}
            onArrival={() => {
              console.log('Contractor arrived at job location')
            }}
          />
        </div>
      )}

      {/* Mark Job as Complete Button */}
      {job.status === 'in_progress' && !job.contractor_marked_complete && (
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-lg border-2 border-emerald-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                Ready to Complete?
              </h3>
              <p className="text-sm text-slate-600">
                Once you mark this job as complete, the homeowner will review your work and release the payment.
              </p>
              {job.final_cost && (
                <p className="text-sm font-medium text-emerald-700 mt-2">
                  💰 Payment: ${job.final_cost.toFixed(2)}
                </p>
              )}
            </div>
            <button
              onClick={markJobAsComplete}
              disabled={markingComplete}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              {markingComplete ? 'Marking...' : 'Mark as Complete'}
            </button>
          </div>
        </div>
      )}

      {/* Job Already Marked Complete */}
      {job.contractor_marked_complete && job.status !== 'completed' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">⏳ Waiting for Homeowner Approval</h3>
              <p className="text-sm text-amber-800">
                You've marked this job as complete. The homeowner will review your work and release payment shortly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live Chat */}
      {showChat && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">💬 Live Chat</h2>
          <JobChat
            jobId={jobId}
            homeownerName={homeowner.name || 'Homeowner'}
            contractorName={user.email?.split('@')[0] || 'You'}
          />
        </div>
      )}

      {/* Open for Bidding Message */}
      {job.status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <div className="text-amber-800">
            <Clock className="w-12 h-12 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">Open for Bidding</h3>
            <p className="text-sm">
              This job is currently accepting bids from contractors. Chat and navigation will be available once a bid is accepted.
            </p>
          </div>
        </div>
      )}

      {/* Success/Error Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg max-w-md w-full p-8 shadow-xl relative border border-gray-200 animate-in zoom-in-95 duration-300">
            <div className="text-center">
              {/* Icon - Success or Error */}
              {successMessage.includes('submitted successfully') || successMessage.includes('marked as complete') ? (
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
                  <svg className="h-10 w-10 text-blue-600 animate-in zoom-in-50 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                  <AlertCircle className="h-10 w-10 text-red-600 animate-in zoom-in-50 duration-500" />
                </div>
              )}
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {successMessage.includes('submitted successfully') || successMessage.includes('marked as complete') ? 'Success!' : 'Cannot Place Bid'}
              </h3>
              <p className="text-sm text-gray-600">{successMessage}</p>
              <button
                onClick={() => {
                  setShowSuccessModal(false)
                  if (successMessage.includes('submitted successfully')) {
                    router.push('/dashboard/contractor/jobs?tab=my-jobs')
                  }
                }}
                className={`mt-6 px-6 py-2 rounded-md focus:outline-none focus:ring-2 transition-colors ${
                  successMessage.includes('submitted successfully') || successMessage.includes('marked as complete')
                    ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                    : 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
