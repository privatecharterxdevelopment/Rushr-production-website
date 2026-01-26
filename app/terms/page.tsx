'use client'
import React from 'react'
import Link from 'next/link'

export default function Terms(){
  return (
    <div className="section">
      <div className="max-w-3xl mx-auto card p-6">
        <h1 className="text-2xl font-semibold text-ink">Terms of Service</h1>
        <p className="text-sm text-slate-600 mt-1">Last updated: {new Date().toLocaleDateString()}</p>

        <h2 className="mt-6 font-semibold text-ink">1. Agreement</h2>
        <p className="mt-2 text-sm">By accessing or using Rushr, you agree to these Terms. If you do not agree, do not use the Service.</p>

        <h2 className="mt-4 font-semibold text-ink">2. The Service</h2>
        <p className="mt-2 text-sm">Rushr connects homeowners with contractors. Rushr is not a party to agreements between users and does not guarantee outcomes.</p>

        <h2 className="mt-4 font-semibold text-ink">3. Accounts</h2>
        <p className="mt-2 text-sm">You are responsible for your account credentials and all activity under your account.</p>

        <h2 className="mt-4 font-semibold text-ink">4. Payments</h2>
        <p className="mt-2 text-sm">Pricing for Pro and Pro Plus is posted on the <Link className="underline" href="/pricing">Pricing</Link> page and may change. Taxes may apply.</p>

        <h2 className="mt-4 font-semibold text-ink">5. User Conduct</h2>
        <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
          <li>No illegal activity or false identities.</li>
          <li>No scraping, reverse engineering, or circumventing controls.</li>
          <li>Respect privacy and local licensing requirements.</li>
        </ul>

        <h2 className="mt-4 font-semibold text-ink">6. Content</h2>
        <p className="mt-2 text-sm">You own your content. You grant Rushr a limited license to host and display content solely to provide the Service.</p>

        <h2 className="mt-4 font-semibold text-ink">7. Disclaimers</h2>
        <p className="mt-2 text-sm">The Service is provided “as is” without warranties. Use at your own risk.</p>

        <h2 className="mt-4 font-semibold text-ink">8. Liability</h2>
        <p className="mt-2 text-sm">To the maximum extent permitted by law, Rushr is not liable for indirect, incidental, or consequential damages.</p>

        <h2 className="mt-4 font-semibold text-ink">9. Termination</h2>
        <p className="mt-2 text-sm">We may suspend or terminate accounts for violations of these Terms.</p>

        <h2 className="mt-4 font-semibold text-ink">10. Changes</h2>
        <p className="mt-2 text-sm">We may update these Terms. Continued use constitutes acceptance.</p>

        <h2 className="mt-4 font-semibold text-ink">11. Contact</h2>
        <p className="mt-2 text-sm">Questions? Email <a className="underline" href="mailto:hello@userushr.com">hello@userushr.com</a>.</p>
      </div>
    </div>
  )
}
