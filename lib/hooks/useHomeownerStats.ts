import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

export interface HomeownerStats {
  active_services: number
  completed_services: number
  unread_messages: number
  trusted_contractors: number
  total_spent: number
  first_job_completed: boolean
  member_since: string
}

export interface HomeownerJob {
  id: string
  job_number?: number
  title: string
  description: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'emergency'
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  contractor_id: string | null
  estimated_cost: number | null
  final_cost: number | null
  scheduled_date: string | null
  completed_date: string | null
  address: string | null
  created_at: string
  updated_at: string
  requested_contractor_id?: string | null
  requested_contractor_name?: string | null
  bids_count?: number
}

export function useHomeownerStats() {
  const { user } = useAuth()
  const [stats, setStats] = useState<HomeownerStats | null>(null)
  const [jobs, setJobs] = useState<HomeownerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    if (!user) return

    try {
      // Fetch stats and jobs in parallel
      const [statsResult, jobsResult] = await Promise.all([
        supabase
          .from('homeowner_dashboard_stats')
          .select('*')
          .eq('homeowner_id', user.id)
          .single(),
        supabase
          .from('homeowner_jobs')
          .select('*')
          .eq('homeowner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)
      ])

      // Handle stats
      if (statsResult.error) {
        console.error('Error fetching homeowner stats:', statsResult.error.message || JSON.stringify(statsResult.error))
        // If no stats exist yet, use defaults
        setStats({
          active_services: 0,
          completed_services: 0,
          unread_messages: 0,
          trusted_contractors: 0,
          total_spent: 0,
          first_job_completed: false,
          member_since: new Date().toISOString()
        })
      } else {
        setStats(statsResult.data)
      }

      // Handle jobs
      if (jobsResult.error) {
        console.error('Error fetching homeowner jobs:', jobsResult.error.message || JSON.stringify(jobsResult.error))
        setJobs([])
      } else {
        setJobs(jobsResult.data || [])
      }

    } catch (err: any) {
      console.error('Error in fetchStats:', err?.message || JSON.stringify(err))
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const updateJobStatus = async (jobId: string, newStatus: HomeownerJob['status']) => {
    try {
      const { error } = await supabase.rpc('update_job_status', {
        p_job_id: jobId,
        p_new_status: newStatus,
        p_completed_date: newStatus === 'completed' ? new Date().toISOString() : null
      })

      if (error) {
        console.error('Error updating job status:', error)
      } else {
        // Refresh data
        fetchStats()
      }
    } catch (err) {
      console.error('Error updating job status:', err)
    }
  }

  const addTrustedContractor = async (contractorId: string, trustLevel: 'trusted' | 'preferred' = 'trusted') => {
    if (!user) return

    try {
      const { error } = await supabase.rpc('add_trusted_contractor', {
        p_homeowner_id: user.id,
        p_contractor_id: contractorId,
        p_trust_level: trustLevel
      })

      if (error) {
        console.error('Error adding trusted contractor:', error)
      } else {
        // Refresh stats
        fetchStats()
      }
    } catch (err) {
      console.error('Error adding trusted contractor:', err)
    }
  }

  // Set up real-time subscriptions
  useEffect(() => {
    let isMounted = true

    if (!user) {
      // Reset state when no user
      setStats(null)
      setJobs([])
      setLoading(false)
      return
    }

    // Initial fetch
    const loadInitialData = async () => {
      if (!user || !isMounted) return

      try {
        // Fetch stats and jobs in parallel
        const [statsResult, jobsResult] = await Promise.all([
          supabase
            .from('homeowner_dashboard_stats')
            .select('*')
            .eq('homeowner_id', user.id)
            .single(),
          supabase
            .from('homeowner_jobs')
            .select('*')
            .eq('homeowner_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10)
        ])

        if (!isMounted) return

        // Handle stats - silently use defaults if no row exists (PGRST116 = no rows returned)
        if (statsResult.error) {
          // Only log non-expected errors (not "no rows" which is expected for new users)
          if (statsResult.error.code !== 'PGRST116') {
            console.warn('Homeowner stats not available:', statsResult.error.code)
          }
          setStats({
            active_services: 0,
            completed_services: 0,
            unread_messages: 0,
            trusted_contractors: 0,
            total_spent: 0,
            first_job_completed: false,
            member_since: new Date().toISOString()
          })
        } else {
          setStats(statsResult.data)
        }

        // Handle jobs
        if (jobsResult.error) {
          console.warn('Could not load homeowner jobs:', jobsResult.error.code)
          setJobs([])
        } else {
          setJobs(jobsResult.data || [])
        }
      } catch (err: any) {
        // Silently handle network errors (Load failed, AbortError, etc.) - these are transient
        const isNetworkError = err?.message?.includes('Load failed') ||
                               err?.message?.includes('AbortError') ||
                               err?.message?.includes('network') ||
                               err?.name === 'AbortError'

        if (!isNetworkError && isMounted) {
          console.warn('Dashboard data fetch issue:', err?.message)
          setError('Failed to load dashboard data')
        }

        // Still set defaults so the UI doesn't break
        if (isMounted) {
          setStats({
            active_services: 0,
            completed_services: 0,
            unread_messages: 0,
            trusted_contractors: 0,
            total_spent: 0,
            first_job_completed: false,
            member_since: new Date().toISOString()
          })
          setJobs([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadInitialData()

    // Debounce timer for fetchStats to prevent excessive calls
    let debounceTimer: NodeJS.Timeout | null = null
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadInitialData()
      }, 500)
    }

    // Subscribe to job changes
    const jobsSubscription = supabase
      .channel('homeowner_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'homeowner_jobs',
          filter: `homeowner_id=eq.${user.id}`
        },
        () => {
          debouncedRefresh()
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      if (debounceTimer) clearTimeout(debounceTimer)
      jobsSubscription.unsubscribe()
    }
  }, [user])

  return {
    stats,
    jobs,
    loading,
    error,
    updateJobStatus,
    addTrustedContractor,
    refreshStats: fetchStats
  }
}
