'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { UserCheck, Mail, Phone, MapPin, DollarSign, Search } from 'lucide-react'

type Contractor = {
  id: string
  name: string
  email: string
  phone: string | null
  business_name: string | null
  status: string
  kyc_status: string
  service_areas: string[] | null
  hourly_rate: number | null
  created_at: string
  categories: string[] | null
}

export default function AllContractorsPage() {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchContractors()

    const subscription = supabase
      .channel('all-contractors')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pro_contractors' }, () => {
        fetchContractors()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  const fetchContractors = async () => {
    try {
      const { data, error } = await supabase
        .from('pro_contractors')
        .select('*')
        .order('created_at', { ascending: false })

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

  const filteredContractors = contractors.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_approval': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'approved': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'rejected': return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'online': return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">All Contractors</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          {contractors.length} total contractors registered
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, email, or business..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['approved', 'pending_approval', 'online', 'rejected'].map((status) => (
          <div key={status} className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
            <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">{status.replace('_', ' ')}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {contractors.filter((c) => c.status === status).length}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Contractor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {filteredContractors.map((contractor) => (
              <tr key={contractor.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900 dark:text-white">{contractor.name}</div>
                  {contractor.business_name && (
                    <div className="text-sm text-gray-500 dark:text-slate-400">{contractor.business_name}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {contractor.email}
                  </div>
                  {contractor.phone && (
                    <div className="flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3" />
                      {contractor.phone}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(contractor.status)}`}>
                    {contractor.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                  {contractor.hourly_rate ? `$${contractor.hourly_rate}/hr` : '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                  {new Date(contractor.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
