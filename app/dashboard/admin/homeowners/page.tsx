'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import { Users, Mail, MapPin, Calendar, Search, Home } from 'lucide-react'

type Homeowner = {
  id: string
  name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  subscription_type: string
  created_at: string
  avatar_url: string | null
}

export default function HomeownersPage() {
  const [homeowners, setHomeowners] = useState<Homeowner[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchHomeowners()

    const subscription = supabase
      .channel('homeowners-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => {
        fetchHomeowners()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  const fetchHomeowners = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('role', 'homeowner')
        .order('created_at', { ascending: false })

      if (error) throw error
      setHomeowners(data || [])
    } catch (error) {
      console.error('Error fetching homeowners:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredHomeowners = homeowners.filter((h) =>
    h.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.city?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Loading homeowners..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Homeowners</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          {homeowners.length} registered homeowners
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, email, or city..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {['free', 'pro', 'signals'].map((subType) => (
          <div key={subType} className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
            <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">{subType}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {homeowners.filter((h) => h.subscription_type === subType).length}
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
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Subscription
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {filteredHomeowners.map((homeowner) => (
              <tr key={homeowner.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {homeowner.avatar_url ? (
                      <img
                        src={homeowner.avatar_url}
                        alt={homeowner.name}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                        <Home className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                      </div>
                    )}
                    <div className="font-medium text-gray-900 dark:text-white">{homeowner.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {homeowner.email}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                  {homeowner.city && homeowner.state ? (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {homeowner.city}, {homeowner.state}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    homeowner.subscription_type === 'pro'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      : homeowner.subscription_type === 'signals'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
                  }`}>
                    {homeowner.subscription_type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                  {new Date(homeowner.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
