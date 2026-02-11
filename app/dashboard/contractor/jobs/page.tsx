'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useProAuth } from '../../../../contexts/ProAuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
  AlertCircle,
  MessageSquare,
  Send,
  CheckCircle,
  X,
  Briefcase,
  ListChecks,
  Eye,
  Download,
  Search,
  Zap,
  Timer
} from 'lucide-react'

interface Job {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  address: string
  zip_code: string
  phone: string
  homeowner_id: string
  created_at: string
  urgencyScore?: number
}

interface MyJob extends Job {
  bid_amount?: number
  bid_status?: string
  bid_created_at?: string
}

interface DirectJob {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  address: string
  zip_code: string
  direct_amount: number
  final_cost: number
  created_at: string
  homeowner_id: string
  remaining_minutes?: number
}

export default function ContractorJobsPage() {
  const router = useRouter()
  const { user, contractorProfile, loading: authLoading } = useProAuth()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as 'available' | 'my-jobs' | 'direct' | null
  const [activeTab, setActiveTab] = useState<'available' | 'my-jobs' | 'direct'>(tabParam || 'available')

  // State for available jobs
  const [jobs, setJobs] = useState<Job[]>([])
  const [myJobs, setMyJobs] = useState<MyJob[]>([])
  const [directJobs, setDirectJobs] = useState<DirectJob[]>([])
  const [loading, setLoading] = useState(true)
  const [acceptingJob, setAcceptingJob] = useState<string | null>(null)

  // Restrict access to contractors only
  useEffect(() => {
    if (authLoading) return // Wait for auth to load

    // If no user, redirect to pro login
    if (!user) {
      router.push('/pro/login')
      return
    }

    // If user exists but no contractor profile, redirect to homeowner dashboard
    if (!contractorProfile) {
      router.push('/dashboard/homeowner')
      return
    }
  }, [user, contractorProfile, authLoading, router])

  // Filters for available jobs
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [zip, setZip] = useState('')
  const [radius, setRadius] = useState(0)
  const [sort, setSort] = useState<'Newest'|'Urgency high'>('Newest')

  // Bidding state
  const [bidding, setBidding] = useState<string | null>(null)
  const [bidAmount, setBidAmount] = useState<Record<string, string>>({})
  const [bidMessage, setBidMessage] = useState<Record<string, string>>({})
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showBidModal, setShowBidModal] = useState(false)
  const [selectedJobForBid, setSelectedJobForBid] = useState<Job | null>(null)

  // Categories
  const categories = ['Plumbing', 'Electrical', 'HVAC', 'Locksmith', 'Garage Door', 'Glass Repair', 'Appliance Repair', 'Handyman', 'Roofing', 'Fencing', 'Gas', 'Snow Removal', 'Security', 'Water Damage', 'Drywall']

  const fetchJobs = async () => {
    if (!user) return
    try {
      // Fetch all bids from this contractor
      const { data: appliedJobs, error: bidsError } = await supabase
        .from('job_bids')
        .select('job_id')
        .eq('contractor_id', user.id);

      if (bidsError) {
        // Only log actual errors, not "no rows" scenarios
        if (bidsError.code !== 'PGRST116') {
          console.error('Error fetching bids:', bidsError);
        }
      }

      const appliedJobIds = appliedJobs?.map(b => b.job_id) || [];

      // Get all available jobs except those already bid on
      let query = supabase
        .from('homeowner_jobs')
        .select('*')
        .eq('status', 'pending')

      // Only apply the filter if there are applied jobs
      if (appliedJobIds.length > 0) {
        query = query.not('id', 'in', `(${appliedJobIds.join(',')})`)
      }

      const { data: availableJobs, error: jobsError } = await query
        .order('created_at', { ascending: false });

      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
      } else {
        const transformedJobs = (availableJobs || []).map(job => ({
          ...job,
          urgencyScore: job.priority === 'emergency' ? 9 :
                       job.priority === 'high' ? 7 :
                       job.priority === 'medium' ? 5 : 3,
        }));
        setJobs(transformedJobs);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchDirectJobs = async () => {
    if (!user || !contractorProfile) return
    try {
      const response = await fetch(`/api/jobs/available-direct?contractorId=${user.id}&zip=${contractorProfile.zip_code || ''}`)
      const data = await response.json()

      if (data.success && data.jobs) {
        setDirectJobs(data.jobs)
      } else {
        setDirectJobs([])
      }
    } catch (err) {
      console.error('Error fetching direct jobs:', err)
      setDirectJobs([])
    }
  }

  const handleAcceptDirectJob = async (job: DirectJob) => {
    if (!user) return

    setAcceptingJob(job.id)

    try {
      // Create a bid at the fixed direct_amount price
      // This allows multiple contractors to accept simultaneously
      // The homeowner will then pick one and click "Start Job"
      const { data, error } = await supabase
        .from('job_bids')
        .insert([{
          job_id: job.id,
          contractor_id: user.id,
          homeowner_id: job.homeowner_id,
          bid_amount: job.direct_amount,
          message: 'Accepted at fixed price',
          status: 'pending'
        }])
        .select()

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation - already accepted
          setSuccessMessage('You have already accepted this job. Waiting for homeowner to select you.')
          setShowSuccessModal(true)
        } else {
          console.error('Error accepting direct job:', error)
          setSuccessMessage(error.message || 'Failed to accept job. Please try again.')
          setShowSuccessModal(true)
        }
      } else {
        setSuccessMessage(`Accepted! You'll earn $${job.direct_amount.toFixed(2)} if the homeowner selects you. Waiting for their decision.`)
        setShowSuccessModal(true)
        fetchDirectJobs()
        fetchMyJobs()

        // Notify homeowner (bell + email) — fire and forget
        fetch('/api/jobs/notify-direct-acceptance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            contractorId: user.id,
            bidAmount: job.direct_amount
          })
        }).catch(err => console.error('Notify direct acceptance error:', err))
      }
    } catch (err) {
      console.error('Error accepting direct job:', err)
      setSuccessMessage('Failed to accept job. Please try again.')
      setShowSuccessModal(true)
    } finally {
      setAcceptingJob(null)
    }
  }

  const fetchMyJobs = async () => {
    if (!user) return
    try {
      // 1. Fetch all my bids first
      const { data: myBids, error: bidsError } = await supabase
        .from('job_bids')
        .select('*')
        .eq('contractor_id', user.id)
        .order('created_at', { ascending: false});

      if (bidsError && bidsError.code !== 'PGRST116') {
        console.error('Error fetching my bids:', bidsError);
      }

      // 2. Fetch jobs where I was directly requested (direct offers)
      const { data: directOffers, error: directOffersError } = await supabase
        .from('homeowner_jobs')
        .select('*')
        .eq('requested_contractor_id', user.id)
        .order('created_at', { ascending: false});

      if (directOffersError && directOffersError.code !== 'PGRST116') {
        console.error('Error fetching direct offers:', directOffersError);
      }

      // 3. Fetch jobs for my bids
      let jobsFromBids: any[] = [];
      if (myBids && myBids.length > 0) {
        const jobIds = myBids.map(bid => bid.job_id);
        const { data: jobs, error: jobsError } = await supabase
          .from('homeowner_jobs')
          .select('*')
          .in('id', jobIds);

        if (jobsError) {
          console.error('Error fetching jobs:', jobsError);
        } else {
          // Combine bids with job data
          jobsFromBids = myBids.map((bid: any) => {
            const job = jobs?.find(j => j.id === bid.job_id);
            return {
              ...job,
              bid_amount: bid.bid_amount,
              bid_status: bid.status,
              bid_created_at: bid.created_at,
              source: 'bid' // Mark source
            };
          }).filter(job => job.id); // Filter out any nulls
        }
      }

      // 4. Transform direct offers to include source marker
      const transformedDirectOffers = (directOffers || []).map(job => ({
        ...job,
        source: 'direct_offer',
        bid_status: 'direct_offer' // Special status for direct offers
      }));

      // 5. Combine both lists, removing duplicates (prefer bid version if exists)
      const allJobs = [...transformedDirectOffers, ...jobsFromBids];
      const uniqueJobs = allJobs.filter((job, index, self) =>
        index === self.findIndex(j => j.id === job.id)
      );

      setMyJobs(uniqueJobs);
    } catch (err) {
      console.error('Error fetching my jobs:', err)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchJobs()
    fetchMyJobs()
    fetchDirectJobs()
  }, [user, contractorProfile])

  // Auto-refresh direct jobs every 30 seconds
  useEffect(() => {
    if (!user || activeTab !== 'direct') return

    const interval = setInterval(() => {
      fetchDirectJobs()
    }, 30000)

    return () => clearInterval(interval)
  }, [user, activeTab])

  // Filter available jobs
  const filtered = useMemo(()=>{
    let arr = [...jobs]

    // Search filter
    if(q){
      const qq = q.toLowerCase()
      arr = arr.filter(j =>
        j.title.toLowerCase().includes(qq) ||
        (j.description || '').toLowerCase().includes(qq) ||
        (j.category || '').toLowerCase().includes(qq)
      )
    }

    // Category filter
    if(cat!=='All') arr = arr.filter(j => j.category === cat)

    // ZIP code and radius filter
    if(zip){
      if (radius<=5) arr = arr.filter(j => j.zip_code === zip)
      else if (radius<=10) arr = arr.filter(j => j.zip_code?.slice(0,4) === zip.slice(0,4))
      else if (radius<=25) arr = arr.filter(j => j.zip_code?.slice(0,3) === zip.slice(0,3))
    }

    // Sorting
    if(sort==='Urgency high') arr.sort((a,b)=> (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0))
    if(sort==='Newest') arr.sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return arr
  }, [jobs, q, cat, zip, radius, sort])

  const handleSubmitBid = async (job: Job) => {
    if (!user || !contractorProfile) return

    // Check if contractor is approved
    if (contractorProfile.status !== 'approved') {
      setSuccessMessage('You must be approved by an administrator before you can place bids. Please wait for approval or contact support.')
      setShowSuccessModal(true)
      return
    }

    const amount = bidAmount[job.id]
    const message = bidMessage[job.id]

    if (!amount || parseFloat(amount) <= 0) {
      setSuccessMessage('Please enter a valid bid amount')
      setShowSuccessModal(true)
      return
    }

    setBidding(job.id)

    try {
      console.log('[BID] Submitting bid:', {
        job_id: job.id,
        contractor_id: user.id,
        homeowner_id: job.homeowner_id,
        bid_amount: parseFloat(amount),
        message: message || '',
        status: 'pending'
      })

      const { data, error } = await supabase
        .from('job_bids')
        .insert([{
          job_id: job.id,
          contractor_id: user.id,
          homeowner_id: job.homeowner_id,
          bid_amount: parseFloat(amount),
          message: message || '',
          status: 'pending'
        }])
        .select()

      if (error) {
        console.error('[BID] Error submitting bid:', error)
        console.error('[BID] Error details:', JSON.stringify(error, null, 2))
        setSuccessMessage(`Failed to submit bid: ${error.message}`)
        setShowSuccessModal(true)
      } else {
        setSuccessMessage(`Bid of $${parseFloat(amount).toFixed(2)} submitted successfully! The homeowner will be notified.`)
        setShowSuccessModal(true)
        fetchJobs()
        fetchMyJobs() // Refresh my jobs list
        setBidAmount(prev => ({ ...prev, [job.id]: '' }))
        setBidMessage(prev => ({ ...prev, [job.id]: '' }))
        setShowBidModal(false) // Close the bid modal
        setSelectedJobForBid(null)
      }
    } catch (err) {
      console.error('Error submitting bid:', err)
      setSuccessMessage('Failed to submit bid. Please try again.')
      setShowSuccessModal(true)
    } finally {
      setBidding(null)
    }
  }

  const exportCSV = ()=>{
    const rows = [
      ['Title','Category','ZIP','Priority','Status','Created Date'],
      ...filtered.map(j => [
        j.title, j.category || 'General', j.zip_code || '', j.priority,
        j.status, new Date(j.created_at).toLocaleDateString()
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'rushr-contractor-jobs.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const getBidStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'direct_offer':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'confirmed':
        return 'bg-purple-100 text-purple-800'
      case 'pending':
        return 'bg-amber-100 text-amber-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  // Show loading while checking auth or if redirecting
  if (authLoading || loading || !contractorProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/contractor"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Jobs</h1>
        <p className="text-slate-600 mt-1">Find jobs to bid on and track your active work</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('available')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'available'
                ? 'text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              <span>Available Jobs</span>
              {filtered.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                  {filtered.length}
                </span>
              )}
            </div>
            {activeTab === 'available' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('direct')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'direct'
                ? 'text-emerald-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>Direct Payment</span>
              {directJobs.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full animate-pulse">
                  {directJobs.length}
                </span>
              )}
            </div>
            {activeTab === 'direct' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('my-jobs')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'my-jobs'
                ? 'text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              <span>My Jobs</span>
              {myJobs.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                  {myJobs.length}
                </span>
              )}
            </div>
            {activeTab === 'my-jobs' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        </div>
      </div>

      {/* Available Jobs Tab */}
      {activeTab === 'available' && (
        <>
          {/* Filters Section */}
          <section className="bg-white border border-blue-200 rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-blue-900">Browse Available Jobs</h2>
                <p className="text-slate-600 text-sm mt-1">Find emergency jobs in your area and submit competitive bids</p>
              </div>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Title, description, category…"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={cat}
                  onChange={e => setCat(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="All">All</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* ZIP */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                <input
                  type="text"
                  placeholder="10001"
                  value={zip}
                  onChange={e => setZip(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={5}
                />
              </div>

              {/* Radius */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Radius</label>
                <select
                  value={radius}
                  onChange={e => setRadius(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!zip}
                >
                  <option value={0}>Any</option>
                  <option value={5}>5 miles</option>
                  <option value={10}>10 miles</option>
                  <option value={25}>25 miles</option>
                </select>
              </div>
            </div>

            {/* Sort */}
            <div className="mt-4 flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700">Sort</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSort('Newest')}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    sort === 'Newest'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Newest
                </button>
                <button
                  onClick={() => setSort('Urgency high')}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    sort === 'Urgency high'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Urgency High
                </button>
              </div>
            </div>

            {/* Results Count */}
            <div className="mt-4 text-sm text-slate-600">
              Showing <span className="font-semibold text-blue-700">{filtered.length}</span> {filtered.length === 1 ? 'job' : 'jobs'}
            </div>
          </section>

          {/* Jobs List */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <Briefcase className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No available jobs match your filters</p>
              <p className="text-sm text-slate-500 mt-1">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((job) => (
                <div key={job.id} className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                  {/* Job Card Content */}
                  <div className="p-6 flex-1 flex flex-col">
                    {/* Title and Status */}
                    <div className="mb-3">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900 flex-1 line-clamp-2">{job.title}</h3>
                        {job.priority === 'emergency' && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full flex-shrink-0">
                            🚨 URGENT
                          </span>
                        )}
                      </div>
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getJobStatusColor(job.status)}`}>
                        {job.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-slate-600 text-sm mb-4 line-clamp-3 flex-1">{job.description}</p>

                    {/* Job Details */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{job.address || job.zip_code}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span className="capitalize">{job.category}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span>{new Date(job.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                      <Link
                        href={`/dashboard/contractor/jobs/${job.id}`}
                        className="flex-1 text-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors"
                      >
                        View Details
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedJobForBid(job)
                          setShowBidModal(true)
                        }}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors"
                      >
                        Bid Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Direct Payment Jobs Tab */}
      {activeTab === 'direct' && (
        <>
          {/* Direct Payment Info Banner */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-emerald-900 mb-1">Direct Payment Jobs</h2>
                <p className="text-emerald-700 text-sm">
                  These jobs have a fixed price set by the homeowner. Accept to let them know you're available — they'll pick a contractor to start the job.
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs text-emerald-600">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>No bidding required</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>Fixed price guaranteed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" />
                    <span>Limited time offers</span>
                  </div>
                </div>
              </div>
              <button
                onClick={fetchDirectJobs}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          {/* Direct Jobs List */}
          {directJobs.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <Zap className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No direct payment jobs available right now</p>
              <p className="text-sm text-slate-500 mt-1">Check back soon - new jobs appear frequently!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {directJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white border-2 border-emerald-200 rounded-xl shadow-sm hover:shadow-lg transition-all overflow-hidden"
                >
                  {/* Urgent Header */}
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-white" />
                      <span className="text-white font-bold text-lg">${job.direct_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full">
                      <Timer className="h-3.5 w-3.5 text-white" />
                      <span className="text-white text-xs font-medium">
                        {job.remaining_minutes !== undefined
                          ? job.remaining_minutes > 0
                            ? `${job.remaining_minutes} min left`
                            : 'Expiring soon'
                          : 'Limited time'
                        }
                      </span>
                    </div>
                  </div>

                  {/* Job Content */}
                  <div className="p-5">
                    {/* Title */}
                    <h3 className="text-lg font-semibold text-slate-900 mb-2 line-clamp-2">{job.title}</h3>

                    {/* Description */}
                    <p className="text-slate-600 text-sm mb-4 line-clamp-2">{job.description}</p>

                    {/* Details */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{job.address || job.zip_code}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="capitalize">{job.category}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Clock className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span>Posted {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Priority Badge */}
                    {job.priority === 'emergency' && (
                      <div className="mb-4">
                        <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                          🚨 EMERGENCY
                        </span>
                      </div>
                    )}

                    {/* Accept Button */}
                    <button
                      onClick={() => handleAcceptDirectJob(job)}
                      disabled={acceptingJob === job.id}
                      className={`w-full py-3 rounded-xl font-semibold text-center transition-all flex items-center justify-center gap-2 ${
                        acceptingJob === job.id
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl shadow-emerald-600/25'
                      }`}
                    >
                      {acceptingJob === job.id ? (
                        <>
                          <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                          Accepting...
                        </>
                      ) : (
                        <>
                          <Zap className="h-5 w-5" />
                          Accept for ${job.direct_amount.toFixed(2)}
                        </>
                      )}
                    </button>

                    <p className="text-center text-xs text-slate-500 mt-2">
                      Accept to let the homeowner know you're available
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* My Jobs Tab */}
      {activeTab === 'my-jobs' && (
        <>
          {/* Earnings Summary */}
          {myJobs.length > 0 && (() => {
            const completedJobs = myJobs.filter((j: any) => j.status === 'completed')
            const totalEarned = completedJobs.reduce((sum: number, j: any) => {
              const payout = (j.final_price || j.final_cost || j.direct_amount || j.bid_amount || 0) * 0.9
              return sum + payout
            }, 0)
            return (
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-4 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total Earned</p>
                    <p className="text-2xl font-bold text-emerald-700">${totalEarned.toFixed(2)}</p>
                  </div>
                  <div className="w-px h-10 bg-emerald-200" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Completed</p>
                    <p className="text-2xl font-bold text-slate-900">{completedJobs.length}</p>
                  </div>
                  <div className="w-px h-10 bg-emerald-200" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Active</p>
                    <p className="text-2xl font-bold text-blue-600">{myJobs.filter((j: any) => j.status === 'in_progress' || j.status === 'confirmed').length}</p>
                  </div>
                </div>
              </div>
            )
          })()}

          {myJobs.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <ListChecks className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No jobs yet</p>
              <p className="text-sm text-slate-500 mt-1">Start bidding on available jobs to see them here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myJobs.map((job) => (
                <div key={job.id} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                  {/* Job Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-semibold text-slate-900">{job.title}</h3>
                        {job.priority === 'emergency' && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            🚨 EMERGENCY
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 text-sm">{job.description}</p>
                    </div>
                  </div>

                  {/* Job Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-slate-200">
                    {job.bid_status === 'direct_offer' ? (
                      <>
                        {/* Direct Offer - Show special UI */}
                        <div className="col-span-2">
                          <div className="text-xs text-slate-500 mb-1">Offer Type</div>
                          <span className="inline-flex px-3 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white border border-blue-400">
                            ⭐ DIRECT OFFER - You were specifically requested!
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Job Status</div>
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getJobStatusColor(job.status)}`}>
                            {job.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Requested</div>
                          <div className="text-sm text-slate-700">
                            {new Date(job.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Regular Bid - Show bid info */}
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Your Bid</div>
                          <div className="text-lg font-semibold text-blue-600">
                            ${job.bid_amount?.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Bid Status</div>
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getBidStatusColor(job.bid_status || 'pending')}`}>
                            {job.bid_status?.toUpperCase() || 'PENDING'}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Job Status</div>
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getJobStatusColor(job.status)}`}>
                            {job.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Bid Placed</div>
                          <div className="text-sm text-slate-700">
                            {job.bid_created_at ? new Date(job.bid_created_at).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Final Price — shown for completed or pending-completion jobs */}
                  {((job as any).final_price || (job as any).status === 'completed') && (
                    <div className="mb-4 pb-4 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-500">Final Price</span>
                          <p className="text-lg font-bold text-emerald-700">
                            ${Number((job as any).final_price || (job as any).final_cost || (job as any).direct_amount || (job as any).bid_amount || 0).toFixed(2)}
                          </p>
                        </div>
                        {(job as any).status === 'completed' && (
                          <div>
                            <span className="text-xs text-slate-500">Your Payout (90%)</span>
                            <p className="text-lg font-bold text-blue-600">
                              ${(Number((job as any).final_price || (job as any).final_cost || (job as any).direct_amount || (job as any).bid_amount || 0) * 0.9).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Job Details */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{job.address || job.zip_code}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span className="capitalize">{job.category}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {job.bid_status === 'direct_offer' ? (
                      <button
                        onClick={() => {
                          setSelectedJobForBid(job)
                          setShowBidModal(true)
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg transition-all text-sm shadow-md hover:shadow-lg"
                      >
                        <DollarSign className="h-4 w-4" />
                        Place Your Bid
                      </button>
                    ) : job.bid_status === 'accepted' ? (
                      <Link
                        href={`/dashboard/contractor/jobs/${job.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        <Eye className="h-4 w-4" />
                        View Job
                      </Link>
                    ) : null}
                  </div>

                  {/* Status Message */}
                  {job.bid_status === 'direct_offer' && (
                    <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800 font-medium">
                        🎯 You were specifically requested for this job! Place your bid to accept this opportunity.
                      </p>
                    </div>
                  )}
                  {job.bid_status === 'pending' && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        ⏳ Waiting for homeowner to review your bid
                      </p>
                    </div>
                  )}
                  {job.bid_status === 'accepted' && job.status === 'confirmed' && (
                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-sm text-emerald-800">
                        ✅ Your bid was accepted! Click "View Job" to start working
                      </p>
                    </div>
                  )}
                  {job.bid_status === 'rejected' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800">
                        ❌ Your bid was not accepted. The homeowner chose another contractor.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Success/Error Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in duration-200">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              {/* Icon - Success or Error */}
              {successMessage.includes('submitted successfully') ? (
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-blue-600" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
              )}
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {successMessage.includes('submitted successfully') ? 'Bid Submitted!' : 'Cannot Place Bid'}
              </h3>
              <p className="text-slate-600 mb-6">{successMessage}</p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className={`w-full font-medium py-3 px-4 rounded-lg transition-colors ${
                  successMessage.includes('submitted successfully')
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bid Modal */}
      {showBidModal && selectedJobForBid && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-in fade-in duration-200">
            <button
              onClick={() => {
                setShowBidModal(false)
                setSelectedJobForBid(null)
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-6">
              {/* Job Details */}
              <div className="mb-6">
                <div className="flex items-start gap-3 mb-4">
                  <h3 className="text-2xl font-bold text-slate-900 flex-1">{selectedJobForBid.title}</h3>
                  {selectedJobForBid.priority === 'emergency' && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                      🚨 EMERGENCY
                    </span>
                  )}
                </div>

                <p className="text-slate-600 mb-4">{selectedJobForBid.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-700">{selectedJobForBid.address || selectedJobForBid.zip_code}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-700 capitalize">{selectedJobForBid.category}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-700">{new Date(selectedJobForBid.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getJobStatusColor(selectedJobForBid.status)}`}>
                      {selectedJobForBid.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bid Form */}
              <div className="border-t border-slate-200 pt-6">
                <h4 className="font-semibold text-slate-900 mb-4">Submit Your Bid</h4>
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
                        value={bidAmount[selectedJobForBid.id] || ''}
                        onChange={(e) => setBidAmount(prev => ({ ...prev, [selectedJobForBid.id]: e.target.value }))}
                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Message (Optional)
                    </label>
                    <div className="relative">
                      <MessageSquare className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                      <textarea
                        placeholder="Add a message to the homeowner..."
                        value={bidMessage[selectedJobForBid.id] || ''}
                        onChange={(e) => setBidMessage(prev => ({ ...prev, [selectedJobForBid.id]: e.target.value }))}
                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleSubmitBid(selectedJobForBid)}
                      disabled={bidding === selectedJobForBid.id}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {bidding === selectedJobForBid.id ? 'Submitting...' : 'Submit Bid'}
                    </button>
                    <button
                      onClick={() => {
                        setShowBidModal(false)
                        setSelectedJobForBid(null)
                      }}
                      disabled={bidding === selectedJobForBid.id}
                      className="px-6 py-3 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
