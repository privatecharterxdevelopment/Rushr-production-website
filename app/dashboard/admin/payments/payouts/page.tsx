'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { CheckCircle, XCircle, AlertTriangle, DollarSign, Wallet } from 'lucide-react'

type ContractorPayout = {
  id: string
  name: string
  email: string
  stripe_account_id: string | null
  onboarding_complete: boolean
  payouts_enabled: boolean
  charges_enabled: boolean
  requirements_currently_due: string[] | null
  pending_payouts_count: number
  pending_payouts_amount: number
  total_earnings: number
  last_payout_date: string | null
}

export default function ContractorPayoutsPage() {
  const [contractors, setContractors] = useState<ContractorPayout[]>([])
  const [loading, setLoading] = useState(true)

  const fetchContractorPayouts = async () => {
    try {
      // Fetch all contractors with Stripe accounts
      const { data: contractorsData, error } = await supabase
        .from('pro_contractors')
        .select('id, name, email')
        .eq('status', 'approved')

      if (error) throw error

      // Fetch Stripe Connect accounts
      const contractorsWithPayouts = await Promise.all(
        (contractorsData || []).map(async (contractor) => {
          const [{ data: stripeAccount }, { data: pendingPayouts }, { data: totalEarnings }] =
            await Promise.all([
              supabase
                .from('stripe_connect_accounts')
                .select('*')
                .eq('contractor_id', contractor.id)
                .maybeSingle(),
              supabase
                .from('payment_holds')
                .select('contractor_payout')
                .eq('contractor_id', contractor.id)
                .eq('status', 'captured'),
              supabase
                .from('payment_holds')
                .select('contractor_payout, released_at')
                .eq('contractor_id', contractor.id)
                .eq('status', 'released'),
            ])

          const pendingAmount =
            pendingPayouts?.reduce((sum, p) => sum + Number(p.contractor_payout), 0) || 0
          const totalEarned = totalEarnings?.reduce((sum, p) => sum + Number(p.contractor_payout), 0) || 0
          const lastPayout =
            totalEarnings && totalEarnings.length > 0
              ? totalEarnings.sort(
                  (a, b) =>
                    new Date(b.released_at!).getTime() - new Date(a.released_at!).getTime()
                )[0].released_at
              : null

          return {
            ...contractor,
            stripe_account_id: stripeAccount?.stripe_account_id || null,
            onboarding_complete: stripeAccount?.onboarding_complete || false,
            payouts_enabled: stripeAccount?.payouts_enabled || false,
            charges_enabled: stripeAccount?.charges_enabled || false,
            requirements_currently_due: stripeAccount?.requirements_currently_due || null,
            pending_payouts_count: pendingPayouts?.length || 0,
            pending_payouts_amount: pendingAmount,
            total_earnings: totalEarned,
            last_payout_date: lastPayout,
          }
        })
      )

      setContractors(contractorsWithPayouts.sort((a, b) => b.pending_payouts_amount - a.pending_payouts_amount))
    } catch (error) {
      console.error('Error fetching contractor payouts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContractorPayouts()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg"  />
      </div>
    )
  }

  const totalPendingPayouts = contractors.reduce((sum, c) => sum + c.pending_payouts_amount, 0)
  const totalLifetimePayouts = contractors.reduce((sum, c) => sum + c.total_earnings, 0)
  const contractorsWithPendingPayouts = contractors.filter((c) => c.pending_payouts_count > 0).length
  const contractorsNeedingSetup = contractors.filter((c) => !c.payouts_enabled).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contractor Payouts</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Monitor Stripe Connect accounts and payout status
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Pending Payouts</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(totalPendingPayouts)}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            {contractorsWithPendingPayouts} contractors
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Lifetime Payouts</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(totalLifetimePayouts)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Setup Complete</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {contractors.length - contractorsNeedingSetup}/{contractors.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Needs Setup</div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {contractorsNeedingSetup}
          </div>
        </div>
      </div>

      {/* Contractors Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Contractor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Stripe Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Pending Payouts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Total Earned
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Last Payout
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {contractors.map((contractor) => (
              <tr key={contractor.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900 dark:text-white">{contractor.name}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">{contractor.email}</div>
                </td>
                <td className="px-6 py-4">
                  {contractor.stripe_account_id ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm">
                        {contractor.payouts_enabled ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-600" />
                        )}
                        <span className="text-gray-700 dark:text-slate-300">
                          Payouts {contractor.payouts_enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                      {contractor.requirements_currently_due &&
                        contractor.requirements_currently_due.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            {contractor.requirements_currently_due.length} requirements due
                          </div>
                        )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-slate-400">No Stripe account</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {contractor.pending_payouts_count > 0 ? (
                    <div>
                      <div className="font-medium text-amber-600 dark:text-amber-400">
                        {formatCurrency(contractor.pending_payouts_amount)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        {contractor.pending_payouts_count} payment{contractor.pending_payouts_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-slate-400">None</span>
                  )}
                </td>
                <td className="px-6 py-4 font-medium text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(contractor.total_earnings)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                  {contractor.last_payout_date
                    ? new Date(contractor.last_payout_date).toLocaleDateString()
                    : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contractorsNeedingSetup > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Setup Required</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {contractorsNeedingSetup} contractor{contractorsNeedingSetup !== 1 ? 's have' : ' has'} not completed
                Stripe Connect onboarding. They cannot receive payouts until setup is complete.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
