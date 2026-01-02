// app/how-it-works/page.tsx
'use client'
import React from 'react'
import Link from 'next/link'
import { useApp } from '../../lib/state'

export default function HowItWorksPage(){
  const { state, openAuth, addToast } = useApp()

  const postOrAuth = ()=>{
    if(!state.user.signedIn){
      openAuth()
      addToast?.('Sign in to post your emergency job')
      return
    }
    window.location.href = '/post-job'
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 space-y-16">

      {/* Hero */}
      <section className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
          How Rushr works
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Connect with verified professionals in your area quickly and efficiently.
          Get quotes, compare options, and hire with confidence.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={postOrAuth}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Post a Job
          </button>
          <Link
            href="/find-pro"
            className="border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Find a Pro
          </Link>
        </div>
      </section>

      {/* How It Works Steps */}
      <section>
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900">Simple, fast, and transparent</h2>
          <p className="mt-2 text-gray-600">Get help in 4 easy steps</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-emerald-50 rounded-lg mb-4">
              <span className="text-xl font-bold text-emerald-600">1</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Post your job</h3>
            <p className="text-gray-600 text-sm mb-3">Quickly describe your job with our simple form. Location auto-detected, urgency level assessed instantly.</p>
            <ul className="space-y-1 text-sm text-gray-500">
              <li>• 30 seconds to post</li>
              <li>• 24/7 availability</li>
              <li>• Auto location detection</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-emerald-50 rounded-lg mb-4">
              <span className="text-xl font-bold text-emerald-600">2</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Get matched with pros</h3>
            <p className="text-gray-600 text-sm mb-3">Pros in your area are instantly notified and can respond within minutes with availability and quotes.</p>
            <ul className="space-y-1 text-sm text-gray-500">
              <li>• Average 4-min response</li>
              <li>• Verified professionals</li>
              <li>• Real-time availability</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-emerald-50 rounded-lg mb-4">
              <span className="text-xl font-bold text-emerald-600">3</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Communicate directly</h3>
            <p className="text-gray-600 text-sm mb-3">Chat directly with pros, share photos/videos, get location tracking and ETA updates.</p>
            <ul className="space-y-1 text-sm text-gray-500">
              <li>• Live chat & video</li>
              <li>• GPS tracking</li>
              <li>• Photo sharing</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-emerald-50 rounded-lg mb-4">
              <span className="text-xl font-bold text-emerald-600">4</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Job complete</h3>
            <p className="text-gray-600 text-sm mb-3">Professional completes the work and you're all set. Payment and documentation handled securely.</p>
            <ul className="space-y-1 text-sm text-gray-500">
              <li>• Secure payment</li>
              <li>• Work documentation</li>
              <li>• Follow-up support</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Services We Cover */}
      <section>
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-gray-900">Emergency services we cover</h3>
          <p className="mt-2 text-gray-600">
            24/7 emergency response for urgent situations that can't wait
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Home Emergencies</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Burst pipes & water leaks</li>
              <li>• Gas leaks & odors</li>
              <li>• Electrical hazards & outages</li>
              <li>• No heat/AC in extreme weather</li>
              <li>• Lockouts & security breaches</li>
              <li>• Storm & wind damage</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Roadside Emergencies</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Dead battery jumpstart</li>
              <li>• Flat tire replacement</li>
              <li>• Vehicle lockout service</li>
              <li>• Emergency towing</li>
              <li>• Out of gas/fuel delivery</li>
              <li>• Stranded vehicle assistance</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Urgent Repairs</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Broken windows & glass</li>
              <li>• Emergency board-up service</li>
              <li>• Sewage backup & flooding</li>
              <li>• Fallen tree removal</li>
              <li>• Water heater failures</li>
              <li>• Fire/smoke damage cleanup</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-600">Have an urgent emergency not listed? Post it - our pros respond to all critical situations!</p>
        </div>
      </section>

      {/* Why Choose Rushr */}
      <section>
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-gray-900">Why choose Rushr?</h3>
          <p className="mt-2 text-gray-600">
            Built for urgent situations where every minute matters
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Fast response</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Average 4-minute response time</li>
              <li>• Real-time notifications to nearby pros</li>
              <li>• Instant availability confirmation</li>
              <li>• Priority routing system</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Verified professionals</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Background-checked professionals</li>
              <li>• Licensed and insured</li>
              <li>• 24/7 availability verification</li>
              <li>• Response training certified</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Real-time tracking</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Live GPS tracking</li>
              <li>• ETA updates every 2 minutes</li>
              <li>• Photo/video sharing</li>
              <li>• Direct communication</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="bg-white border border-gray-200 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">4min</div>
            <div className="text-sm text-gray-600">Average Response</div>
          </div>
          <div className="bg-white border border-gray-200 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">24/7</div>
            <div className="text-sm text-gray-600">Always Available</div>
          </div>
          <div className="bg-white border border-gray-200 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">100%</div>
            <div className="text-sm text-gray-600">Verified Pros</div>
          </div>
          <div className="bg-white border border-gray-200 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">GPS</div>
            <div className="text-sm text-gray-600">Live Tracking</div>
          </div>
        </div>
      </section>

      {/* Trust & Safety */}
      <section>
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-gray-900">Trust & safety</h3>
          <p className="mt-2 text-gray-600">Your safety and security are our top priorities</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Identity verified</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Government ID verification required</li>
              <li>• Real-time background checks</li>
              <li>• Certification badges</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Support protocol</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• 24/7 support hotline</li>
              <li>• Live GPS tracking for your safety</li>
              <li>• Instant services backup</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Secure communication</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Encrypted messaging</li>
              <li>• Photo/video sharing capability</li>
              <li>• Live status updates</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-xl font-semibold text-gray-900 mb-4">Complete documentation</h4>
            <ul className="space-y-2 text-gray-600">
              <li>• Full response records</li>
              <li>• Work completion documentation</li>
              <li>• Payment protection guarantee</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gray-50 rounded-lg p-12 text-center">
        <h3 className="text-3xl md:text-4xl font-bold text-gray-900">
          Ready to get started?
        </h3>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Get connected with verified professionals in your area right now.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button onClick={postOrAuth} className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-4 rounded-lg font-bold text-lg">
            Post a Job
          </button>
          <Link href="/find-pro" className="border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 px-10 py-4 rounded-lg font-bold text-lg">
            Find a Pro
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-600">
          <span>• 4-minute average response</span>
          <span>• 24/7 availability</span>
          <span>• 100% verified professionals</span>
        </div>
      </section>

      {/* Link to About */}
      <section className="text-center">
        <p className="text-gray-600">
          Learn more about our mission on our <Link href="/about" className="underline font-semibold text-emerald-600 hover:text-emerald-700">About</Link> page.
        </p>
      </section>
    </div>
  )
}

