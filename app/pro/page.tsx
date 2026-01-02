"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { useProAuth } from "../../contexts/ProAuthContext"
import LoadingSpinner from "../../components/LoadingSpinner"
import {
  Zap,
  MessageSquare,
  BarChart3,
  BellRing,
  Lock,
  MapPin,
  ArrowRight,
  BadgeCheck,
  TrendingUp,
  Clock,
  ShieldCheck,
  Sparkles,
  Quote,
  CalendarDays,
  Users,
  LineChart,
  Hammer,
  Wrench,
  Wind,
  Flame,
  Lightbulb,
  Paintbrush,
  ShowerHead,
  Ruler,
  Globe,
  CheckCircle,
  XCircle,
} from "lucide-react"

/* ----------------------------------------------------------------
   Brand color helpers (single source of truth)
----------------------------------------------------------------- */
const BRAND_BLUE = "#2563EB" // change this once to retheme
const proText = "text-[var(--pro)]"
const proBg = "bg-[var(--pro)]"
const proRing = "focus-visible:ring-[var(--pro)]"

export default function ProHome() {
  const { user, contractorProfile, loading } = useProAuth()
  const router = useRouter()

  // Redirect authenticated CONTRACTOR users to their dashboard
  // Do NOT redirect homeowners - they can view the marketing page
  useEffect(() => {
    if (!loading && user && contractorProfile) {
      // Only redirect if user is actually a contractor
      setTimeout(() => {
        router.push('/dashboard/contractor')
      }, 100)
    }
  }, [user, contractorProfile, loading, router])

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg"  color="blue" />
      </div>
    )
  }

  // Only show redirect spinner if user is a contractor
  if (user && contractorProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg"  color="blue" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-clip bg-gray-50">
      <GradientMesh />
      <Hero />
      <HowItWorks />
      <OpportunityMap />
      <Demo />
      <ProductTour />
      <ProTools />
      <Comparison />
      <WhySwitch />
      <TradesWeServe />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <MobileStickyCTA />
      <LocalKeyframes />
    </div>
  )
}

/* -------------------------------------------
   HERO with Live Preview Tabs
-------------------------------------------- */
function Hero() {
  const [tab, setTab] = useState<"jobs" | "chat" | "board">("jobs")
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 pt-16 pb-10 md:grid-cols-2 md:pt-24">
        {/* Left: copy */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-semibold tracking-tight text-gray-900 md:text-5xl"
          >
            Win jobs before competitors even quote
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-4 max-w-xl text-lg text-gray-600"
          >
            Rushr Pro gives you real-time job alerts, direct chat with homeowners, and a pipeline that closes.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link href="/pro/contractor-signup">
              <Button size="lg" className={`${proBg} text-white ${proRing} hover:bg-blue-700`}>
  Join as a Pro
  <ArrowRight className="ml-2 h-5 w-5" />
</Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="border-[var(--pro)] text-[var(--pro)] hover:bg-[color:rgb(37_99_235_/_0.08)] focus-visible:ring-[var(--pro)]"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('proauth:open', { detail: { mode: 'signin' } }))
                }
              }}
            >
              Already a Pro? Sign In
            </Button>
            <Link href="#tour">
              <Button
                size="lg"
                variant="outline"
                className="border-[var(--pro)] text-[var(--pro)] hover:bg-[color:rgb(37_99_235_/_0.08)] focus-visible:ring-[var(--pro)]"
              >
                Take the tour
              </Button>
            </Link>
          </motion.div>

          <ul className="mt-6 grid max-w-lg grid-cols-2 gap-3 text-sm text-gray-700 sm:grid-cols-3">
            {[
              { icon: <ShieldCheck className="h-4 w-4" />, text: "Licensed pros" },
              { icon: <TrendingUp className="h-4 w-4" />, text: "Higher close rates" },
              { icon: <Clock className="h-4 w-4" />, text: "Same-day leads" },
              { icon: <MapPin className="h-4 w-4" />, text: "Zip targeting" },
              { icon: <BadgeCheck className="h-4 w-4" />, text: "Verified reviews" },
              { icon: <Sparkles className="h-4 w-4" />, text: "Smart follow-ups" },
            ].map((b, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-blue-200/60 bg-white/80 px-3 py-2 backdrop-blur"
              >
                <span className={proText}>{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: live preview */}
        <div className="relative">
          <Card className="relative overflow-hidden border-blue-200/70 bg-white/80 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 border-b bg-white/70 px-3 py-2">
              {[
                { id: "jobs", label: "Jobs" },
                { id: "chat", label: "Chat" },
                { id: "board", label: "Pipeline" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    tab === t.id ? `${proBg} font-semibold text-white` : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <CardContent className="relative p-4">
              {tab === "jobs" && <PreviewJobs />}
              {tab === "chat" && <PreviewChat />}
              {tab === "board" && <PreviewBoard />}
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-blue-200/70" />
            </CardContent>
          </Card>
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[color:rgb(37_99_235_/_0.12)] blur-3xl" />
        </div>
      </div>
    </section>
  )
}

function PreviewJobs() {
  const items = [
    { t: "Emergency electrical repair", s: "Upper West Side • 1.2mi", m: "2m ago" },
    { t: "Water heater replacement", s: "Bushwick • 4.8mi", m: "9m ago" },
    { t: "Bathroom plumbing install", s: "Astoria • 2.3mi", m: "15m ago" },
  ]
  return (
    <div className="space-y-3">
      {items.map((i, idx) => (
        <div key={idx} className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <div className="font-semibold text-gray-900">{i.t}</div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-gray-500" />
              {i.s}
            </div>
          </div>
          <span className="rounded-full bg-[color:rgb(219_234_254)] px-2 py-1 text-xs font-semibold text-[color:rgb(37_99_235)]">
            {i.m}
          </span>
        </div>
      ))}
      <div className="mt-3 flex items-center justify-between rounded-xl border bg-[color:rgb(219_234_254_/_0.6)] p-3">
        <div className="text-sm text-[color:rgb(30_64_175)]">Sign in to unlock all job opportunities in your area</div>
        <Lock className={proText + " h-4 w-4"} />
      </div>
    </div>
  )
}

function PreviewChat() {
  const lines = [
    { who: "Homeowner", text: "Hi, power keeps tripping in the kitchen." },
    { who: "You", text: "Can you send a photo of the panel and outlets?" },
    { who: "Homeowner", text: "Uploading now. Available tomorrow 4–6 pm?" },
  ]
  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
          <MessageSquare className={`${proText} h-4 w-4`} />
          Direct chat thread
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className={`flex ${l.who === "You" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  l.who === "You" ? `${proBg} text-white` : "bg-gray-100 text-gray-800"
                }`}
              >
                <span className="block text-[11px] opacity-70">{l.who}</span>
                {l.text}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border p-3 text-sm text-gray-600">
        Attach photos, drop a quick quote, propose times, all in one place.
      </div>
    </div>
  )
}

function PreviewBoard() {
  const cols = ["New", "In discussion", "Quoted", "Won"]
  return (
    <div className="grid grid-cols-4 gap-3">
      {cols.map((c, i) => (
        <div key={i} className="rounded-xl border bg-white/70 p-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">{c}</div>
            <div className="text-xs text-gray-500">{i === 3 ? "3" : i + 2}</div>
          </div>
          <div className="space-y-2">
            {[1, 2].map((k) => (
              <div key={k} className="rounded-lg border bg-white/80 p-2 text-xs text-gray-700">
                {c} job {k}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------
   HOW IT WORKS (equal-height)
-------------------------------------------- */
function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Get matched with local jobs",
      desc:
        "We connect you with homeowners posting jobs in your area in real time—so you can respond fast and win more work.",
      icon: <Zap className={`h-6 w-6 ${proText}`} />,
    },
    {
      n: 2,
      title: "Chat and qualify instantly",
      desc:
        "Message the homeowner right away, request photos, share yours, and drop a fast quote or schedule a visit.",
      icon: <MessageSquare className={`h-6 w-6 ${proText}`} />,
    },
    {
      n: 3,
      title: "Track bids and win more",
      desc: "Move jobs from New to Won. Reviews build trust and bring repeat work.",
      icon: <BarChart3 className={`h-6 w-6 ${proText}`} />,
    },
  ]
  return (
    <section className="mx-auto max-w-7xl px-6 py-10 md:py-14">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold text-gray-900">How Rushr Pro works</h2>
        <p className="mt-2 text-gray-600">Connect with homeowners instantly, respond faster than competitors, and close more jobs with our streamlined platform.</p>
      </div>
      <div className="mt-8 grid items-stretch gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <TiltCard key={i}>
            <Card className="relative h-full min-h-[220px] overflow-hidden border-blue-200/60 bg-white/80 shadow-sm backdrop-blur">
              <GradientBorder />
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:rgb(239_246_255)] ring-1 ring-[color:rgb(191_219_254)]">
                  {s.icon}
                </div>
                <div>
                  <CardTitle className="text-gray-900">
                    <span
                      className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full ${proBg} text-xs font-bold text-white`}
                    >
                      {s.n}
                    </span>
                    {s.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-gray-600">{s.desc}</p>
              </CardContent>
            </Card>
          </TiltCard>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------
   TARGET THE RIGHT NEIGHBORHOODS (radius-only filtering)
-------------------------------------------- */
function OpportunityMap() {
  const [radiusMi, setRadiusMi] = useState(35)

  const pins = [
    { left: 18, top: 24, title: "Electrical repair needed", meta: "Upper West Side • Panel upgrade", time: "3m" },
    { left: 42, top: 62, title: "Emergency plumbing", meta: "Bushwick • Water heater", time: "11m" },
    { left: 70, top: 38, title: "Bathroom remodel", meta: "Astoria • 2-bath layout", time: "16m" },
    { left: 60, top: 18, title: "HVAC replacement", meta: "LIC • 3-ton condenser", time: "27m" },
    { left: 34, top: 48, title: "Roofing repair", meta: "Greenpoint • Flashing", time: "31m" },
    { left: 52, top: 35, title: "Gas line work", meta: "Williamsburg • Installation", time: "42m" },
  ]

  // map 1–100mi => ~8–45% of container radius (visual only)
  const radiusPct = useMemo(() => {
    const pct = 8 + Math.min(100, Math.max(1, radiusMi)) * 0.37
    return Math.min(45, Math.max(8, pct))
  }, [radiusMi])

  const visiblePins = useMemo(() => {
    return pins.filter((p) => {
      const dx = p.left - 50
      const dy = p.top - 50
      const dist = Math.sqrt(dx * dx + dy * dy)
      return dist <= radiusPct
    })
  }, [pins, radiusPct])

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 md:py-14">
      <div className="grid items-start gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900">Target the right neighborhoods</h3>
          <p className="mt-2 max-w-xl text-gray-600">
            Set a custom radius. We'll show you job opportunities <b>inside</b> your area in real time so you can be first to respond.
          </p>

          <div className="mt-6">
            <label className="block text-sm text-gray-700">Radius: {radiusMi} mi</label>
            <input
              type="range"
              min={1}
              max={100}
              value={radiusMi}
              onChange={(e) => setRadiusMi(parseInt(e.target.value))}
              className="mt-2 w-full"
              style={{ accentColor: "var(--pro)" }}
            />
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white/80 px-3 py-2 text-gray-700">
                <Globe className={`${proText} h-4 w-4`} />
                Any city
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white/80 px-3 py-2 text-gray-700">
                <MapPin className={`${proText} h-4 w-4`} />
                Any ZIP
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white/80 px-3 py-2 text-gray-700">
                <BellRing className={`${proText} h-4 w-4`} />
                Custom radius: {radiusMi} mi
              </span>
            </div>
          </div>
        </div>

        {/* mini map */}
        <div className="relative">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-[radial-gradient(1200px_600px_at_70%_-20%,rgba(59,130,246,0.12),transparent),radial-gradient(1000px_400px_at_-10%_120%,rgba(16,185,129,0.10),transparent)]">
            {/* subtle grid + land/water shapes */}
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #000 1px, transparent 0)", backgroundSize: "22px 22px" }}
            />
            <div className="absolute right-[-10%] top-[-20%] h-[60%] w-[40%] rounded-full bg-[color:rgb(147_197_253_/_0.25)] blur-2xl" />
            <div className="absolute left-[10%] bottom-[8%] h-[22%] w-[30%] rounded-[30%] bg-[color:rgb(110_231_183_/_0.28)] blur-xl" />

            {/* radius circle */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:rgb(37_99_235_/_0.28)]"
              style={{ width: `${radiusPct * 2}%`, height: `${radiusPct * 2}%` }}
            />

            {/* pins INSIDE the circle only, perfectly centered */}
            {[...visiblePins].map((p, i) => (
              <div
                key={i}
                className="absolute"
                style={{ left: `${p.left}%`, top: `${p.top}%`, transform: "translate(-50%, -50%)" }}
                title={`${p.title} — ${p.meta}`}
              >
                <span className="relative block">
                  <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-[color:rgb(96_165_250_/_0.30)]" />
                  <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[color:rgb(59_130_246_/_0.45)]" />
                  <span className="relative z-10 inline-flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--pro)] ring-2 ring-white" />
                </span>
              </div>
            ))}
          </div>

          {/* live list */}
          <div className="mt-4 rounded-xl border bg-white/85 p-3">
            <div className="mb-2 text-sm font-semibold text-gray-800">Jobs in radius: {visiblePins.length}</div>
            {visiblePins.length === 0 ? (
              <div className="text-sm text-gray-600">No jobs in this radius. Increase the radius to see more.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {visiblePins.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-white/70 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className={`${proText} h-4 w-4 shrink-0`} />
                      <span className="truncate font-medium text-gray-900">{p.title}</span>
                      <span className="hidden shrink-0 text-gray-500 sm:inline">•</span>
                      <span className="hidden truncate text-gray-600 sm:inline">{p.meta}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-[color:rgb(219_234_254)] px-2 py-1 text-[11px] font-semibold text-[color:rgb(37_99_235)]">
                      {p.time} ago
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------
   LIVE JOB FEED DEMO
-------------------------------------------- */
function Demo() {
  const items = [
    { title: "Emergency electrical repair", meta: "Upper West Side • 1.2mi", time: "3m ago", scope: "Panel upgrade • 100A→200A", est: "$1.8k–$2.4k" },
    { title: "Water heater replacement", meta: "Bushwick • 4.8mi", time: "12m ago", scope: "50-gallon unit", est: "$1.2k–$1.8k" },
    { title: "Bathroom plumbing", meta: "Astoria • 2.3mi", time: "18m ago", scope: "2-bath layout • PEX", est: "$3.2k–$4.1k" },
    { title: "Roofing repair", meta: "Long Island City • 3.0mi", time: "22m ago", scope: "Flashing & patch", est: "$900–$1.4k" },
    { title: "HVAC replacement", meta: "Bed-Stuy • 5.5mi", time: "33m ago", scope: "3-ton condenser", est: "$4.5k–$6.2k" },
    { title: "Gas line installation", meta: "Williamsburg • 6.1mi", time: "41m ago", scope: "New appliance hookup", est: "$800–$1.2k" },
  ]
  return (
    <section id="demo" className="relative border-y bg-gradient-to-b from-white to-gray-100">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">Live job feed demo</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <BellRing className={`${proText} h-4 w-4`} />
            <span>Preview feed (locked)</span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
            >
              <Card className="group relative overflow-hidden border-gray-200 bg-white/70 shadow-sm backdrop-blur">
                <LockShimmer />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center justify-between">
                    <span className="line-clamp-1 capitalize">{item.title}</span>
                    <span className="rounded-full bg-[color:rgb(219_234_254)] px-2 py-1 text-xs font-semibold text-[color:rgb(37_99_235)]">
                      {item.time}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-700">{item.meta}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <Lock className="h-4 w-4" /> <span>Sign in to view</span>
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border bg-white/70 p-3">
                    <div className="text-sm text-gray-700 blur-[1px]">
                      <div className="font-medium">Scope: {item.scope}</div>
                      <div className="mt-1">Est. price: {item.est}</div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded bg-gray-200/80">
                      <div className="animate-shimmer h-2 bg-[linear-gradient(90deg,rgba(0,0,0,0)_0%,rgba(255,255,255,0.8)_50%,rgba(0,0,0,0)_100%)] bg-[length:200%_100%]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/pro/contractor-signup">
            <Button size="lg" className={`${proBg} text-white ${proRing} hover:bg-blue-700`}>
  Unlock all job opportunities
</Button>

          </Link>
          <Link href="#tour">
            <Button
              size="lg"
              variant="outline"
              className="border-[var(--pro)] text-[var(--pro)] hover:bg-[color:rgb(37_99_235_/_0.08)] focus-visible:ring-[var(--pro)]"
            >
              Take the tour
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------
   PRODUCT TOUR (equal height)
-------------------------------------------- */
function ProductTour() {
  return (
    <section id="tour" className="mx-auto max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold text-gray-900">A quick tour</h2>
        <p className="mt-2 text-gray-600">Here’s what you’ll use every day.</p>
      </div>

      <div className="mt-8 grid items-stretch gap-6 md:grid-cols-3">
        {/* Chat */}
        <TiltCard>
          <Card className="relative h-full overflow-hidden border-blue-200/60 bg-white/80 shadow-sm">
            <GradientBorder />
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:rgb(239_246_255)] ring-1 ring-[color:rgb(191_219_254)]">
                <MessageSquare className={`${proText} h-6 w-6`} />
              </div>
              <CardTitle className="text-gray-900">Chat with homeowners</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-[340px] flex-col">
              <p className="text-gray-600">Fast messaging with photos, video, and quick quotes.</p>
              <div className="mt-4 space-y-2">
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800">
                    Hi—breaker trips when we use toaster + microwave.
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className={`max-w-[80%] rounded-lg ${proBg} px-3 py-2 text-sm text-white`}>
                    Got it. Can you send a photo of the panel?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800">
                    Sent ✅ Also good tomorrow 4–6 pm.
                  </div>
                </div>
              </div>
              <div className="grow" />
            </CardContent>
          </Card>
        </TiltCard>

        {/* Pipeline */}
        <TiltCard>
          <Card className="relative h-full overflow-hidden border-blue-200/60 bg-white/80 shadow-sm">
            <GradientBorder />
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:rgb(239_246_255)] ring-1 ring-[color:rgb(191_219_254)]">
                <BarChart3 className={`${proText} h-6 w-6`} />
              </div>
              <CardTitle className="text-gray-900">Pipeline board</CardTitle>
            </CardHeader>
            <CardContent className="min-h-[340px]">
              <p className="text-gray-600">Drag jobs from New → In discussion → Quoted → Won.</p>
              <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
                {["New", "In discussion", "Quoted", "Won"].map((c, i) => (
                  <div key={i} className="rounded-lg border p-2">
                    <div className="mb-1 font-semibold">{c}</div>
                    <div className="space-y-1">
                      <div className="rounded border bg-white/80 p-2">Job {i + 1}</div>
                      <div className="rounded border bg-white/80 p-2">Job {i + 2}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TiltCard>

        {/* Profile & reviews */}
        <TiltCard>
          <Card className="relative h-full overflow-hidden border-blue-200/60 bg-white/80 shadow-sm">
            <GradientBorder />
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:rgb(239_246_255)] ring-1 ring-[color:rgb(191_219_254)]">
                <BadgeCheck className={`${proText} h-6 w-6`} />
              </div>
              <CardTitle className="text-gray-900">Profile & reviews</CardTitle>
            </CardHeader>
            <CardContent className="min-h-[340px]">
              <p className="text-gray-600">Show licenses, insurance, and past work. Build trust.</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg border bg-white/70 p-2">
                  <span>Licensed Electrician</span> <span className={proText}>Verified</span>
                </div>
                <div className="rounded-lg border bg-white/70 p-2">
                  <div className="font-medium">“Same-day quote and booked fast.”</div>
                  <div className="text-gray-600">— A. Rivera</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TiltCard>
      </div>
    </section>
  )
}

/* -------------------------------------------
   PRO TOOLS (no blur)
-------------------------------------------- */
function ProTools() {
  const tools = [
    { title: "Scheduling", desc: "Propose times and auto-remind. Syncs to your calendar.", icon: <CalendarDays className={`h-7 w-7 ${proText}`} />, bullets: ["Time slots", "Reminders", "Google Calendar"] },
    { title: "Team Seats", desc: "Invite techs and coordinators. Assign leads, add notes.", icon: <Users className={`h-7 w-7 ${proText}`} />, bullets: ["Roles", "Assignments", "Internal notes"] },
    { title: "Analytics", desc: "See response time and win rate. Double down where you win.", icon: <LineChart className={`h-7 w-7 ${proText}`} />, bullets: ["Response time", "Win rate", "ROI view"] },
  ]
  return (
    <section id="tools" className="mx-auto max-w-7xl px-6 py-14">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold text-gray-900">Pro tools that scale with you</h2>
        <p className="mt-2 text-gray-600">Everything you need once leads start rolling in.</p>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tools.map((f, i) => (
          <Card key={i} className="relative overflow-hidden border-blue-200/60 bg-white/90 shadow-sm">
            <CardHeader>
              <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:rgb(239_246_255)] ring-1 ring-[color:rgb(191_219_254)]">
                {f.icon}
              </div>
              <CardTitle className="text-gray-900">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">{f.desc}</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                {f.bullets.map((b, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className={`mt-[3px] inline-block h-2 w-2 rounded-full ${proBg}`} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------
   COMPARISON
-------------------------------------------- */
function Comparison() {
  const rows = [
    { label: "Real-time job alerts", housecall: true, old: false },
    { label: "Direct homeowner chat", housecall: true, old: false },
    { label: "Zip & radius targeting", housecall: true, old: false },
    { label: "Transparent pipeline", housecall: true, old: false },
    { label: "Verified reviews", housecall: true, old: "sometimes" },
    { label: "Pay for stale lists", housecall: false, old: true },
    { label: "Leads sold to many", housecall: false, old: true },
  ]
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold text-gray-900">Rushr vs old lead platforms</h2>
        <p className="mt-2 text-gray-600">The differences that actually change outcomes.</p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border bg-white/85 shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-[color:rgb(219_234_254_/_0.6)] text-gray-800">
            <tr>
              <th className="px-4 py-3 text-sm font-semibold">Feature</th>
              <th className="px-4 py-3 text-sm font-semibold">Rushr Pro</th>
              <th className="px-4 py-3 text-sm font-semibold">Old platforms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-3">{r.label}</td>
                <td className="px-4 py-3">
                  {r.housecall ? (
                    <span className={`inline-flex items-center gap-1 ${proText}`}>
                      <CheckCircle className="h-5 w-5" /> Included
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <XCircle className="h-5 w-5" /> No
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.old === true ? (
                    <span className="inline-flex items-center gap-1 text-rose-600">
                      <CheckCircle className="h-5 w-5" /> Yes
                    </span>
                  ) : r.old === false ? (
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <XCircle className="h-5 w-5" /> No
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <CheckCircle className="h-5 w-5" /> Sometimes
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* -------------------------------------------
   WHY PROS SWITCH
-------------------------------------------- */
function WhySwitch() {
  const items = [
    { title: "Respond first, win more", desc: "Pros close more when they're first in the door. Real-time alerts + chat make that easy.", stat: "2–3× faster replies" },
    { title: "Target work you want", desc: "Dial in your area and trade, cut the noise, and focus on profitable jobs.", stat: "Fewer dead leads" },
    { title: "Keep every bid moving", desc: "Simple board view keeps owners & crews aligned, from new to won.", stat: "+28% first-week close" },
  ]
  return (
    <section className="mx-auto max-w-7xl px-6 py-14">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold text-gray-900">Why pros switch to Rushr</h2>
        <p className="mt-2 text-gray-600">Real gains from speed, targeting, and organization.</p>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {items.map((it, i) => (
          <Card key={i} className="border-blue-200/60 bg-white/85 shadow-sm">
            <CardContent className="pt-6">
              <div className={`text-sm font-semibold ${proText}`}>{it.stat}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{it.title}</div>
              <p className="mt-2 text-sm text-gray-600">{it.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------
   TRADES WE SERVE
-------------------------------------------- */
function TradesWeServe() {
  const trades = [
    { name: "General contracting", icon: <Hammer className="h-5 w-5" /> },
    { name: "Plumbing", icon: <ShowerHead className="h-5 w-5" /> },
    { name: "Electrical", icon: <Lightbulb className="h-5 w-5" /> },
    { name: "HVAC", icon: <Wind className="h-5 w-5" /> },
    { name: "Heating", icon: <Flame className="h-5 w-5" /> },
    { name: "Appliance repair", icon: <Wrench className="h-5 w-5" /> },
    { name: "Painting", icon: <Paintbrush className="h-5 w-5" /> },
    { name: "Tile and floors", icon: <Ruler className="h-5 w-5" /> },
  ]
  return (
    <section className="mx-auto max-w-7xl px-6 pb-6 md:pb-10">
      <div className="mx-auto max-w-3xl text-center">
        <h3 className="text-2xl font-semibold text-gray-900">Built for the trades</h3>
        <p className="mt-2 text-gray-600">Rushr Pro helps any licensed contractor move faster and win more.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {trades.map((t, i) => (
          <Card key={i} className="border-blue-200/50 bg-white/80">
            <CardContent className="flex items-center gap-3 p-4 text-gray-800">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-[color:rgb(239_246_255)] ${proText} ring-1 ring-[color:rgb(191_219_254)]`}>
                {t.icon}
              </div>
              <span>{t.name}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------
   TESTIMONIALS — equal-height; start clear; blur others on hover
-------------------------------------------- */
function Testimonials() {
  const quotes = [
    {
      quote: "Got an alert for a job in my area. I messaged, quoted, and booked the same day.",
      name: "Mike R.",
      role: "Licensed Electrician",
    },
    {
      quote: "I stopped chasing stale lists. Real conversations turned into real jobs in week one.",
      name: "Sarah L.",
      role: "General Contractor",
    },
    {
      quote: "The board view keeps my crew aligned. Faster replies. More wins.",
      name: "Tony G.",
      role: "HVAC Lead",
    },
  ]
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <section className="relative border-t bg-white">
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-50 via-white to-emerald-50 opacity-60" />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold">Pros who switched to Rushr</h2>

        <div className="mt-8 grid items-stretch gap-6 md:grid-cols-3">
          {quotes.map((t, i) => {
            const dimOthers = hovered !== null && hovered !== i
            return (
              <motion.div
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                animate={{
                  scale: dimOthers ? 0.98 : 1,
                  opacity: dimOthers ? 0.7 : 1,
                  filter: dimOthers ? "blur(1px)" : "blur(0px)",
                }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
                className="h-full"
              >
                <Card className={`relative h-full min-h-[260px] ${hovered === i ? "ring-1 ring-[var(--pro)]" : ""} border-blue-200/60 bg-white/85 shadow-sm`}>
                  <CardContent className="flex h-full flex-col pt-6">
                    <div className={`mb-3 flex items-center gap-2 ${proText}`}>
                      <Quote className="h-5 w-5" />
                      <span className="text-sm font-semibold">From a pro</span>
                    </div>

                    <p className="grow text-gray-700">{t.quote}</p>

                    <div className="mt-4 text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">{t.name}</span> • {t.role}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------
   FAQ
-------------------------------------------- */
function FAQ() {
  const faqs = [
    { q: "Do I pay per lead or monthly", a: "Start free to explore. Upgrade for advanced job alerts, targeting, and higher volume." },
    { q: "How fast are job notifications", a: "Job alerts are real time. Many contractors reply within minutes and win same-day jobs." },
    { q: "Can my team use it", a: "Yes. Invite techs and coordinators with roles and internal notes." },
    { q: "Do I need to change my current process", a: "No. Rushr fits in cleanly. Use chat, keep your pipeline updated, and export data when needed." },
  ]
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h3 className="text-2xl font-semibold text-gray-900">Questions, answered</h3>
        <p className="mt-2 text-gray-600">Short and to the point.</p>
      </div>
      <div className="mx-auto mt-8 max-w-3xl space-y-3">
        {faqs.map((f, i) => (
          <details key={i} className="rounded-xl border border-blue-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer select-none text-gray-900">{f.q}</summary>
            <p className="mt-2 text-gray-600">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------
   FINAL CTA
-------------------------------------------- */
function FinalCTA() {
  return (
    <section id="pricing" className="border-t bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 text-center">
        <h2 className="text-3xl font-bold">Ready to grow your business</h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600">
          Join Rushr Pro and start winning more jobs faster.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/pro/contractor-signup">
      <Button size="lg" className={`${proBg} text-white ${proRing} hover:bg-blue-700`}>
  Join as a Pro
</Button>

          </Link>
          <Link href="#tour">
            <Button
              size="lg"
              variant="outline"
              className="border-[var(--pro)] text-[var(--pro)] hover:bg-[color:rgb(37_99_235_/_0.08)] focus-visible:ring-[var(--pro)]"
            >
              Take the tour
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------
   MOBILE STICKY CTA
-------------------------------------------- */
function MobileStickyCTA() {
  return (
    <div className="sticky bottom-3 z-20 mx-auto w-full max-w-7xl px-4 md:hidden">
      <div className="rounded-2xl border border-blue-200 bg-white/90 p-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="text-left">
            <div className={`text-xs font-semibold ${proText}`}>Rushr Pro</div>
            <div className="text-sm text-gray-700">Job Alerts + Chat + Pipeline</div>
          </div>
          <Link href="/pro/contractor-signup">
           <Button className={`${proBg} text-white ${proRing} hover:bg-blue-700`}>Start</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------
   Small UI helpers
-------------------------------------------- */
function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rx = useTransform(y, [-50, 50], [8, -8])
  const ry = useTransform(x, [-50, 50], [-8, 8])
  const rxs = useSpring(rx, { stiffness: 120, damping: 12 })
  const rys = useSpring(ry, { stiffness: 120, damping: 12 })

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left - rect.width / 2
    const py = e.clientY - rect.top - rect.height / 2
    x.set(px / 6)
    y.set(py / 6)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
      style={{ rotateX: rxs, rotateY: rys, transformStyle: "preserve-3d" }}
      className="will-change-transform"
    >
      <div style={{ transform: "translateZ(0)" }}>{children}</div>
    </motion.div>
  )
}

function GradientMesh() {
  return (
    <div aria-hidden className="fixed inset-0 -z-20">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-50/70 via-white to-emerald-50/40" />
      <svg className="absolute inset-x-0 top-[-180px] -z-10 h-[560px] w-full opacity-50" viewBox="0 0 1155 678" preserveAspectRatio="none">
        <path
          fill="url(#mesh)"
          fillOpacity=".8"
          d="M317.219 518.975L203.852 678 0 451.106l317.219 67.869 204.172-247.652c0 0 73.631-24.85 140.579 20.38 66.948 45.23 161.139 167.81 161.139 167.81l-507.89 59.462z"
        />
        <defs>
          <linearGradient id="mesh" x1="0" x2="1" y1="1" y2="0">
            <stop stopColor="#dbeafe" />
            <stop offset="1" stopColor="#dcfce7" />
          </linearGradient>
        </defs>
      </svg>
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #000 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  )
}

function GradientBorder() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition group-hover:opacity-100"
      style={{ boxShadow: "0 0 0 1px rgba(59,130,246,0.25), 0 8px 28px -12px rgba(59,130,246,0.35)" }}
    />
  )
}

function LockShimmer() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:opacity-100" />
    </div>
  )
}

function LocalKeyframes() {
  return (
    <style>{`
      :root { --pro: ${BRAND_BLUE}; }
      @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      .animate-shimmer { animation: shimmer 1.6s linear infinite }
    `}</style>
  )
}
