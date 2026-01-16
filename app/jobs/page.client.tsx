// app/jobs/page.client.tsx
'use client'
export const dynamic = 'force-dynamic'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useProAuth } from '../../contexts/ProAuthContext'
import { supabase } from '../../lib/supabaseClient'
import JobCard from '../../components/JobCard'
import Skeleton from '../../components/Skeleton'
import LoadingSpinner from '../../components/LoadingSpinner'

interface Job {
  id: string
  title: string
  description: string | null
  category: string | null
  priority: string
  status: string
  created_at: string
  homeowner_id: string
  zip_code: string | null
  // Budget fields - we'll add these later when implementing budget system
  budgetMin?: number
  budgetMax?: number
  budgetType?: string
  urgencyScore?: number
}

export default function JobsInner() {
  const { user, contractorProfile, loading: authLoading } = useProAuth()
  const router = useRouter()
  const sp = useSearchParams()
  const paramCat = sp.get('cat') || 'All'

  // Real job categories
  const categories = ['Plumbing', 'Electrical', 'HVAC', 'Locksmith', 'Garage Door', 'Glass Repair', 'Appliance Repair', 'Handyman', 'Roofing', 'Fencing', 'Gas', 'Snow Removal', 'Security', 'Water Damage', 'Drywall']

  // All hooks must be called before any conditional returns
  const [jobs, setJobs] = useState<Job[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(categories.includes(paramCat) ? paramCat : 'All')
  const [zip, setZip] = useState('')
  const [radius, setRadius] = useState(0)
  const [sort, setSort] = useState<'Newest'|'Budget high'|'Budget low'|'Urgency high'>('Newest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Contractor-only guard - redirect non-contractors
  useEffect(() => {
    if (!authLoading && !contractorProfile) {
      // Not a contractor - redirect to pro sign-in
      router.push('/pro/sign-in?callback=/jobs')
    }
  }, [authLoading, contractorProfile, router])

  // Load real jobs from database
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        console.log('Fetching available jobs for contractors...')

        // Get jobs that are accepting bids (pending status)
        const { data, error } = await supabase
          .from('homeowner_jobs')
          .select('*')
          .eq('status', 'pending') // Only jobs accepting bids
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching jobs:', error)
          setError(error.message || JSON.stringify(error) || 'Failed to fetch jobs')
          return
        }

        console.log('Fetched jobs:', data)

        // Transform database jobs to match expected format
        const transformedJobs: Job[] = (data || []).map(job => ({
          id: job.id,
          title: job.title,
          description: job.description,
          category: job.category || 'General',
          priority: job.priority || 'normal',
          status: job.status,
          created_at: job.created_at,
          homeowner_id: job.homeowner_id,
          zip_code: job.zip_code,
          // Map priority to urgency score for compatibility
          urgencyScore: job.priority === 'emergency' ? 9 :
                       job.priority === 'high' ? 7 :
                       job.priority === 'medium' ? 5 : 3,
          // Default budget values - TODO: implement budget system
          budgetMin: 100,
          budgetMax: 500,
          budgetType: 'hourly'
        }))

        setJobs(transformedJobs)
      } catch (err: any) {
        console.error('Unexpected error:', err)
        setError(err.message || 'Failed to load jobs')
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()
  }, [])

  const filtered = useMemo(()=>{
    let arr = [...jobs] // Use real jobs from database

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
    if(sort==='Budget high') arr.sort((a,b)=>(b.budgetMax ?? b.budgetMin ?? 0) - (a.budgetMax ?? a.budgetMin ?? 0))
    if(sort==='Budget low')  arr.sort((a,b)=>(a.budgetMin ?? 0) - (b.budgetMin ?? 0))
    if(sort==='Urgency high') arr.sort((a,b)=> (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0))
    if(sort==='Newest') arr.sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return arr
  }, [jobs, q, cat, zip, radius, sort])

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
    const a = document.createElement('a'); a.href = url; a.download = 'rushr-jobs.csv'; a.click(); URL.revokeObjectURL(url)
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Don't render content for non-contractors (they'll be redirected)
  if (!contractorProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="container-max section space-y-8">
      {/* Header */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Available Jobs</h1>
              <p className="text-slate-600 text-sm mt-0.5">Browse and apply to emergency service opportunities</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-500"></div>
              {filtered.length} available
            </span>
            <span>•</span>
            <span>Real-time updates</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card p-4 grid md:grid-cols-6 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="label">Search</label>
          <input className="input" placeholder="Title, description, category…" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={cat} onChange={e=>setCat(e.target.value)}>
            <option>All</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">ZIP</label>
            <input className="input" placeholder="10001" value={zip} onChange={e=>setZip(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className="label">Radius</label>
            <select className="input" value={radius} onChange={e=>setRadius(Number(e.target.value))}>
              <option value={0}>Any</option><option value={5}>≤5 mi</option><option value={10}>≤10 mi</option><option value={25}>≤25 mi</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Sort</label>
          <select className="input" value={sort} onChange={e=>setSort(e.target.value as any)}>
            <option>Newest</option><option>Budget high</option><option>Budget low</option><option>Urgency high</option>
          </select>
        </div>
        <div className="flex md:justify-end">
          <button className="btn btn-outline w-full md:w-auto" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Unable to load jobs</h3>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error ? (
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          {Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-40" />)}
        </div>
      ) : !error ? (
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          {filtered.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
          {filtered.length === 0 && jobs.length === 0 && (
            <div className="md:col-span-2 text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No jobs available</h3>
              <p className="text-slate-600 max-w-md mx-auto">
                There are currently no emergency service jobs posted by homeowners. Check back soon for new opportunities!
              </p>
            </div>
          )}
          {filtered.length === 0 && jobs.length > 0 && (
            <div className="md:col-span-2 text-center py-8 text-slate-500">
              <h3 className="text-lg font-semibold mb-2">No jobs match your filters</h3>
              <p>Try adjusting your search criteria or expanding your ZIP code radius.</p>
            </div>
          )}
        </div>
      ) : null}
      </section>
    </div>
  )
}
