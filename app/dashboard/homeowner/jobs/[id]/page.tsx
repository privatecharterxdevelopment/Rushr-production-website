'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../../../../contexts/AuthContext'
import { supabase } from '../../../../../lib/supabaseClient'
import dynamic from 'next/dynamic'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { ArrowLeft, MapPin, Clock, DollarSign, User, Phone, Mail } from 'lucide-react'
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

  const isJobActive = job.status === 'bid_accepted' || job.status === 'in_progress' || job.status === 'confirmed'
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
    </div>
  )
}
