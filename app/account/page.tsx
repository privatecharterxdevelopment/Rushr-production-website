// app/account/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useApp } from '../../lib/state'
import { safeBack } from '../../lib/safeBack'
import RequireAuth from '../../components/RequireAuth'
import { supabaseBrowser } from '../../utils/supabase-browser' // 👈 make sure this path matches your project
import { getDensity, getTheme, setDensity, setTheme, type DensityPref, type ThemePref } from '../../utils/prefs'

// Hook to safely check if running in native app (avoids hydration mismatch)
function useIsNative() {
  const [isNative, setIsNative] = React.useState(false)
  React.useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

/* ---------- small toast helper that tries your global Toaster ---------- */
function useToastSafe() {
  const [inline, setInline] = useState<string | null>(null)
  useEffect(()=> {
    if (!inline) return
    const t = setTimeout(()=>setInline(null), 1600)
    return ()=>clearTimeout(t)
  }, [inline])

  function show(msg: string) {
    // Try a few common bridges; ignore if not present
    try { (window as any).toast?.(msg) } catch {}
    try { (window as any).toaster?.push?.({ message: msg, type: 'success' }) } catch {}
    try { window.dispatchEvent(new CustomEvent('al:toast', { detail: { message: msg, type: 'success' } })) } catch {}
    setInline(msg) // fallback inline banner
  }
  const InlineBanner = inline ? (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm shadow">
      {inline}
    </div>
  ) : null

  return { toast: show, InlineBanner }
}

type TabKey =
  | 'profile'
  | 'email'
  | 'password'
  | 'addresses'
  | 'settings'
  | 'preferences'
  | 'connections'
  | 'danger'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'profile',     label: 'Profile' },
  { key: 'email',       label: 'Email' },
  { key: 'password',    label: 'Password' },
  { key: 'addresses',   label: 'Addresses' },
  { key: 'settings',    label: 'Settings' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'connections', label: 'Connected Accounts' },
  { key: 'danger',      label: 'Danger Zone' },
]

/* ===================== page wrapper (auth required) ===================== */
export default function Page(){
  return (
    <RequireAuth>
      <AccountPage/>
    </RequireAuth>
  )
}

function AccountPage(){
  const { state } = useApp()
  const { toast, InlineBanner } = useToastSafe()
  const [tab, setTab] = useState<TabKey>('profile')
  const router = useRouter()
  const isNative = useIsNative()

  // Restore last tab or use URL param
  useEffect(()=>{
    // Check URL params first (for iOS app deep linking)
    const urlParams = new URLSearchParams(window.location.search)
    const urlTab = urlParams.get('tab') as TabKey | null
    if (urlTab && TABS.some(t=>t.key === urlTab)) {
      setTab(urlTab)
      return
    }
    // Fallback to localStorage
    const saved = localStorage.getItem('accountTab') as TabKey | null
    if (saved && TABS.some(t=>t.key === saved)) setTab(saved)
  },[])
  useEffect(()=>{ localStorage.setItem('accountTab', tab) },[tab])

  // normalize role to UI enums we use here
  const roleUpper = ((state?.user?.role || 'homeowner').toString().toUpperCase()) as 'HOMEOWNER'|'CONTRACTOR'
  const name = state?.user?.name || 'User'

  // Tablist a11y
  const navRef = useRef<HTMLUListElement>(null)
  const onKeyTabs = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex(t => t.key === tab)
    const move = (i: number) => setTab(TABS[(i + TABS.length) % TABS.length].key)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(idx+1) }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); move(idx-1) }
    if (e.key === 'Home')      { e.preventDefault(); setTab(TABS[0].key) }
    if (e.key === 'End')       { e.preventDefault(); setTab(TABS[TABS.length-1].key) }
  }

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-900"
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
      }}
    >
      {/* iOS Native Header */}
      {isNative && (
        <div
          className="sticky top-0 z-50"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
          }}
        >
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => safeBack(router, '/dashboard')}
              className="flex items-center text-white active:opacity-60"
            >
              <ArrowLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Back</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              Account
            </h1>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl relative p-4">
        {InlineBanner}

        {/* Header - Web only */}
        {!isNative && (
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-ink dark:text-white">Account</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">Manage your profile, security, addresses, and preferences.</p>
            </div>
            <Link href="/dashboard" className="btn">Back to Dashboard</Link>
          </div>
        )}

      {/* Layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        {/* Left nav */}
        <nav className="md:sticky md:top-20 h-max">
          <ul
            ref={navRef}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2"
            role="tablist"
            aria-label="Account sections"
            onKeyDown={onKeyTabs}
          >
            {TABS.map((t)=>(
              <li key={t.key}>
                <button
                  role="tab"
                  aria-selected={tab===t.key}
                  aria-controls={`panel-${t.key}`}
                  id={`tab-${t.key}`}
                  onClick={()=>setTab(t.key)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm ${
                    tab===t.key
                      ? 'bg-emerald-600 text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-ink dark:text-white'
                  }`}
                  tabIndex={tab===t.key ? 0 : -1}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>

          {/* Role hint */}
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            Signed in as <span className="font-medium">{name}</span>
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${
              roleUpper==='CONTRACTOR'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
            }`}>
              {roleUpper==='CONTRACTOR' ? 'Contractor' : 'Homeowner'}
            </span>
          </div>
        </nav>

        {/* Right panel */}
        <div className="space-y-6">
          <div role="tabpanel" id="panel-profile" aria-labelledby="tab-profile" hidden={tab!=='profile'}>
            <ProfileSection
              role={roleUpper}
              defaultName={name}
              onSaved={()=>toast('Profile saved')}
              onRoleChanged={async (next) => {
                const supabase = supabaseBrowser()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) return

                // persist role to profiles.role (lowercase in DB)
                await supabase.from('profiles')
                  .update({ role: next.toLowerCase() })
                  .eq('id', session.user.id)

                // if switching to contractor and not onboarded, kick to wizard
                if (next === 'CONTRACTOR') {
                  const { data: prof } = await supabase
                    .from('profiles')
                    .select('pro_onboarded')
                    .eq('id', session.user.id)
                    .maybeSingle()
                  if (!prof?.pro_onboarded) {
                    window.location.href = '/onboarding/pro'
                    return
                  }
                }
                toast(`Role set to ${next === 'CONTRACTOR' ? 'Contractor' : 'Homeowner'}`)
              }}
            />
          </div>

          <div role="tabpanel" id="panel-email" aria-labelledby="tab-email" hidden={tab!=='email'}>
            <EmailSection onSaved={()=>toast('Email updated')} />
          </div>

          <div role="tabpanel" id="panel-password" aria-labelledby="tab-password" hidden={tab!=='password'}>
            <PasswordSection onSaved={()=>toast('Password updated')} />
          </div>

          <div role="tabpanel" id="panel-addresses" aria-labelledby="tab-addresses" hidden={tab!=='addresses'}>
            <AddressesSection onSaved={()=>toast('Addresses saved')} />
          </div>

          <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab!=='settings'}>
            <SettingsSection role={roleUpper} onSaved={()=>toast('Settings saved')} />
          </div>

          <div role="tabpanel" id="panel-preferences" aria-labelledby="tab-preferences" hidden={tab!=='preferences'}>
            <PreferencesSection role={roleUpper} onSaved={()=>toast('Preferences saved')} />
          </div>

          <div role="tabpanel" id="panel-connections" aria-labelledby="tab-connections" hidden={tab!=='connections'}>
            <ConnectionsSection onConnected={(p)=>toast(`${p} connected`)} onDisconnected={(p)=>toast(`${p} disconnected`)} />
          </div>

          <div role="tabpanel" id="panel-danger" aria-labelledby="tab-danger" hidden={tab!=='danger'}>
            <DangerZoneSection onExport={()=>toast('Export started')} onDelete={()=>toast('Delete requested')} />
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

/* ---------------- Profile ---------------- */
function ProfileSection({
  role, defaultName, onSaved, onRoleChanged
}:{ role:'HOMEOWNER'|'CONTRACTOR'; defaultName:string; onSaved:()=>void; onRoleChanged:(r:'HOMEOWNER'|'CONTRACTOR')=>void }) {
  const supabase = supabaseBrowser()
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onFile = (f: File) => {
    if (!/^image\//.test(f.type)) { setErr('Please upload an image'); return }
    if (f.size > 5 * 1024 * 1024) { setErr('Image must be ≤ 5MB'); return }
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result as string)
    reader.readAsDataURL(f)
    setErr(null)
  }

  const phoneOk = !phone || /^[0-9+()\-.\s]{7,}$/.test(phone)
  const companyShown = role === 'CONTRACTOR'
  const canSave = name.trim().length > 1 && phoneOk

  async function saveProfile() {
    if (!canSave) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('profiles')
        .update({ full_name: name })
        .eq('id', session.user.id)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink dark:text-white mb-2">Profile</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Your public information and avatar.</p>

      {/* Role toggle */}
      <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
        <div className="font-medium text-ink dark:text-white mb-2 text-sm">Role</div>
        <div className="flex gap-2">
          {(['HOMEOWNER','CONTRACTOR'] as const).map(r=>(
            <button
              key={r}
              className={`px-3 py-1.5 rounded-lg border text-sm ${
                role===r ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={()=> onRoleChanged(r)}
            >
              {r==='CONTRACTOR' ? 'Contractor' : 'Homeowner'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="h-20 w-20 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          {avatar ? <img src={avatar} alt="Profile photo" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="flex gap-2">
          <label className="btn">
            <input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) onFile(f) }} />
            Upload Photo
          </label>
          {avatar && (
            <button className="btn btn-outline" onClick={()=>setAvatar(null)}>Remove</button>
          )}
        </div>
      </div>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <Field label="Full Name" value={name} onChange={setName} placeholder="Your name" required />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="(555) 555-5555"
               hint={!phoneOk ? 'Invalid phone format' : undefined} invalid={!phoneOk} />
        {companyShown && (
          <Field label="Company" value={company} onChange={setCompany} placeholder="Company LLC" />
        )}
        <label className="text-sm sm:col-span-2">
          <span className="block mb-1">Bio</span>
          <textarea rows={3}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell homeowners or clients about you" />
        </label>
      </div>

      <div className="mt-4">
        <button className="btn-primary disabled:opacity-50" disabled={!canSave || saving} onClick={saveProfile}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </section>
  )
}

/* ---------------- Email ---------------- */
function EmailSection({ onSaved }:{ onSaved:()=>void }){
  const supabase = supabaseBrowser()
  const [currentEmail, setCurrentEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('') // re-auth
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setCurrentEmail(session?.user?.email || '')
    })()
  }, [supabase])

  const emailOk = !!newEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
  const canSave = emailOk && password.length >= 1

  async function submit() {
    setError(null); setInfo(null)
    if (!canSave) return
    setLoading(true)
    try {
      // 1) Re-authenticate with current email + password
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password,
      })
      if (reauthErr) throw new Error('Current password is incorrect.')

      // 2) Request email change – Supabase emails new address to confirm
      const redirectTo = `${window.location.origin}/auth/callback?emailChange=1`
      const { error: updErr } = await supabase.auth.updateUser({ email: newEmail }, { emailRedirectTo: redirectTo } as any)
      if (updErr) throw updErr

      setInfo('Check your new inbox to confirm the change. Your login email will update after confirmation.')
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Could not update email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink dark:text-white mb-2">Email</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
        Current: <span className="font-medium">{currentEmail || '—'}</span>. We’ll email your <em>new</em> address to confirm.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="New Email" value={newEmail} onChange={setNewEmail} placeholder="new@example.com"
               invalid={!!newEmail && !emailOk} hint={!!newEmail && !emailOk ? 'Enter a valid email' : undefined} />
        <Field label="Confirm with current password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button className="btn-primary disabled:opacity-50" disabled={!canSave || loading} onClick={submit}>
          {loading ? 'Sending…' : 'Update Email'}
        </button>
        <span className="text-xs text-slate-500">We’ll send a confirmation email to the new address.</span>
      </div>

      {info && <div className="mt-3 text-sm text-emerald-700">{info}</div>}
      {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
    </section>
  )
}

/* ---------------- Password ---------------- */
function PasswordSection({ onSaved }:{ onSaved:()=>void }){
  const supabase = supabaseBrowser()
  const [sending, setSending] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const currentEmail = session?.user?.email || ''
      setEmail(currentEmail)
    })()
  }, [supabase])

  async function sendReset() {
    setError(null); setInfo(null)
    if (!email) { setError('You are not signed in.'); return }
    setSending(true)
    try {
      const redirectTo = `${window.location.origin}/auth/callback?pw=1`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setInfo('Secure link sent. Check your email to set a new password.')
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Could not send reset email')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink dark:text-white mb-2">Password</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
        For security, password changes happen via a link we email to <span className="font-medium">{email || 'your address'}</span>.
      </p>

      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={sendReset} disabled={sending || !email}>
          {sending ? 'Sending…' : 'Email me a secure link'}
        </button>
        {!email && <span className="text-sm text-slate-500">Sign in again if you don’t see your email.</span>}
      </div>

      {info && <div className="mt-3 text-sm text-emerald-700">{info}</div>}
      {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
    </section>
  )
}

/* ---------------- Addresses ---------------- */
type Addr = { id:string; label:string; line1:string; line2?:string; city:string; state:string; zip:string }

function randomId(){
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  return Math.random().toString(36).slice(2)
}

function AddressesSection({ onSaved }:{ onSaved:()=>void }){
  const [items, setItems] = useState<Addr[]>([
    { id:'a1', label:'Home', line1:'123 Main St', city:'New York', state:'NY', zip:'10001' },
  ])

  const addEmpty = ()=> setItems(prev=>[...prev, { id: randomId(), label:'', line1:'', line2:'', city:'', state:'', zip:'' }])
  const mut = (i:number, patch:Partial<Addr>) => setItems(prev => prev.map((x, idx)=> idx===i ? { ...x, ...patch } : x))
  const removeItem = (id:string) => setItems(prev => prev.filter(x => x.id !== id))

  // validation
  const errors = items.map(a => ({
    label: a.label.trim().length ? '' : 'Label required',
    line1: a.line1.trim().length ? '' : 'Address line 1 required',
    city : a.city.trim().length  ? '' : 'City required',
    state: /^[A-Za-z]{2}$/.test(a.state) ? '' : 'State (2 letters)',
    zip  : /^\d{5}(-\d{4})?$/.test(a.zip) ? '' : 'ZIP (5 digits)',
  }))
  const allOk = errors.every(e => Object.values(e).every(v => v === ''))

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink dark:text-white">Addresses</h2>
        <button className="btn" onClick={addEmpty}>Add Address</button>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Save places for faster job posting and scheduling.</p>

      <div className="space-y-3">
        {items.map((a, idx)=>(
          <div key={a.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="grid md:grid-cols-[1fr,1fr,1fr,80px] gap-3">
              <Field label="Label" value={a.label} onChange={v=>mut(idx, { label:v })} invalid={!!errors[idx].label} hint={errors[idx].label || undefined}/>
              <Field label="Address line 1" value={a.line1} onChange={v=>mut(idx, { line1:v })} invalid={!!errors[idx].line1} hint={errors[idx].line1 || undefined}/>
              <Field label="Address line 2" value={a.line2 || ''} onChange={v=>mut(idx, { line2:v })} />
              <div className="flex md:block items-end justify-end">
                <button className="btn btn-outline" onClick={()=>removeItem(a.id)}>Remove</button>
              </div>
            </div>
            <div className="mt-3 grid sm:grid-cols-3 gap-3">
              <Field label="City"  value={a.city}  onChange={v=>mut(idx, { city:v })}  invalid={!!errors[idx].city}  hint={errors[idx].city  || undefined}/>
              <Field label="State" value={a.state} onChange={v=>mut(idx, { state:v.toUpperCase().slice(0,2) })} invalid={!!errors[idx].state} hint={errors[idx].state || undefined}/>
              <Field label="ZIP"   value={a.zip}   onChange={v=>mut(idx, { zip:v })}  invalid={!!errors[idx].zip}   hint={errors[idx].zip   || undefined}/>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button className="btn-primary disabled:opacity-50" disabled={!allOk} onClick={onSaved}>Save Addresses</button>
      </div>
    </section>
  )
}

/* ---------------- Settings ---------------- */
/* ---------------- Settings ---------------- */
function SettingsSection({ role, onSaved }:{ role:'HOMEOWNER'|'CONTRACTOR'; onSaved:()=>void }) {
  const [theme, setThemeState] = useState<ThemePref>('system')
  const [density, setDensityState] = useState<DensityPref>('comfortable')

  useEffect(() => {
    setThemeState(getTheme())
    setDensityState(getDensity())
  }, [])

  function onThemeChange(next: ThemePref) {
    setThemeState(next)
    setTheme(next)
  }
  function onDensityChange(next: DensityPref) {
    setDensityState(next)
    setDensity(next)
  }

  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink dark:text-white mb-2">Settings</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Notifications, privacy, communication, and more.</p>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="font-medium text-ink dark:text-white mb-2 text-sm">Notifications</div>
          <Toggle label="Email updates" defaultChecked />
          <Toggle label="SMS alerts" />
          {role==='CONTRACTOR' && <Toggle label="Signals notifications" defaultChecked />}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="font-medium text-ink dark:text-white mb-2 text-sm">Privacy</div>
          <Toggle label="Allow pros to view my first name" defaultChecked />
          <Toggle label="Hide phone until I accept a quote" defaultChecked />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="font-medium text-ink dark:text-white mb-2 text-sm">Display</div>

          {/* Theme */}
          <label className="text-sm block mb-3">
            <span className="block mb-1">Theme</span>
            <select
              value={theme}
              onChange={(e)=> onThemeChange(e.target.value as ThemePref)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          {/* Density */}
          <label className="text-sm block">
            <span className="block mb-1">Density</span>
            <select
              value={density}
              onChange={(e)=> onDensityChange(e.target.value as DensityPref)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="font-medium text-ink dark:text-white mb-2 text-sm">Communication</div>
          <Toggle label="Allow SMS for scheduling" defaultChecked />
          <Toggle label="Allow calls from booked pros" />
        </div>
      </div>

      <div className="mt-4">
        <button className="btn-primary" onClick={onSaved}>Save Settings</button>
      </div>
    </section>
  )
}

/* ---------------- Preferences ---------------- */
function PreferencesSection({ role, onSaved }:{ role:'HOMEOWNER'|'CONTRACTOR'; onSaved:()=>void }) {
  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink dark:text-white mb-2">Preferences</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Customize how Rushr works for you.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {role==='CONTRACTOR' ? (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="font-medium text-ink dark:text-white mb-2 text-sm">Leads</div>
              <Toggle label="Auto-apply default quote template" />
              <Toggle label="Alert me when a job matches my rate" defaultChecked />
              <Select label="Default response time" options={['Instant','15 min','1 hour','Same day']} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="font-medium text-ink dark:text-white mb-2 text-sm">Scheduling</div>
              <Select label="Default arrival window" options={['2 hours','3 hours','4 hours']} />
              <Toggle label="Allow weekend jobs" />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="font-medium text-ink dark:text-white mb-2 text-sm">Quotes</div>
              <Toggle label="Require license and insurance proof" defaultChecked />
              <Toggle label="Show total with fees" defaultChecked />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="font-medium text-ink dark:text-white mb-2 text-sm">Scheduling</div>
              <Select label="Preferred work window" options={['Mornings','Afternoons','Evenings']} />
              <Toggle label="Allow Saturday visits" />
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <button className="btn-primary" onClick={onSaved}>Save Preferences</button>
      </div>
    </section>
  )
}

/* ---------------- Connections ---------------- */
function ConnectionsSection({ onConnected, onDisconnected }:{ onConnected:(p:string)=>void; onDisconnected:(p:string)=>void }){
  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink dark:text-white mb-2">Connected Accounts</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Link accounts to sign in faster or sync data.</p>

      <div className="space-y-3">
        <ProviderRow name="Google" onConnected={onConnected} onDisconnected={onDisconnected} />
        <ProviderRow name="Apple" onConnected={onConnected} onDisconnected={onDisconnected} />
        <ProviderRow name="Microsoft" onConnected={onConnected} onDisconnected={onDisconnected} />
      </div>
    </section>
  )
}
function ProviderRow({ name, onConnected, onDisconnected }:{
  name:string; onConnected:(p:string)=>void; onDisconnected:(p:string)=>void
}) {
  const [connected, setConnected] = useState(false)
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="text-sm text-ink dark:text-white">{name}</div>
      {connected ? (
        <button className="btn btn-outline" onClick={()=>{ setConnected(false); onDisconnected(name) }}>Disconnect</button>
      ) : (
        <button className="btn" onClick={()=>{ setConnected(true); onConnected(name) }}>Connect</button>
      )}
    </div>
  )
}

/* ---------------- Danger Zone ---------------- */
function DangerZoneSection({ onExport, onDelete }:{ onExport:()=>void; onDelete:()=>void }){
  return (
    <section className="card p-4 border border-red-200 dark:border-red-900">
      <h2 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">Danger Zone</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">These actions are permanent. Proceed carefully.</p>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div>
            <div className="font-medium text-ink dark:text-white text-sm">Export my data</div>
            <div className="text-xs text-slate-500">Download a copy of your Rushr data.</div>
          </div>
          <button className="btn" onClick={onExport}>Export</button>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div>
            <div className="font-medium text-ink dark:text-white text-sm">Delete account</div>
            <div className="text-xs text-slate-500">This will permanently remove your account.</div>
          </div>
          <button className="btn btn-outline text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </section>
  )
}

/* ---------------- UI helpers ---------------- */
function Field({
  label, value, onChange, type='text', placeholder='', required=false, disabled=false, invalid=false, hint
}:{
  label:string; value:string; onChange:(v:string)=>void; type?:string; placeholder?:string; required?:boolean; disabled?:boolean; invalid?:boolean; hint?:string
}){
  return (
    <label className="text-sm block">
      <span className="block mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={`w-full rounded-lg border px-3 py-2 ${
          invalid ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-slate-700'
        } bg-white dark:bg-slate-900`}
      />
      {hint && <div className="mt-1 text-xs text-red-600">{hint}</div>}
    </label>
  )
}
function Toggle({ label, defaultChecked=false }:{ label:string; defaultChecked?:boolean }){
  const [on, setOn] = useState(!!defaultChecked)
  return (
    <label className="flex items-center justify-between py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5" checked={on} onChange={()=>setOn(v=>!v)} />
    </label>
  )
}
function Select({ label, options }:{ label:string; options:string[] }){
  const [val, setVal] = useState(options[0])
  return (
    <label className="text-sm block">
      <span className="block mb-1">{label}</span>
      <select
        value={val}
        onChange={e=>setVal(e.target.value)}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
      >
        {options.map(o=> <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
