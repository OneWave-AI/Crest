import { useEffect, useState } from 'react'
import type { MobileStatus, MobilePairing } from '../../../shared/mobile'

export default function MobileSettings() {
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [pairing, setPairing] = useState<MobilePairing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const refresh = () => window.api.mobileStatus().then(setStatus).catch(() => {})
    void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer)
  }, [])
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); setStatus(await window.api.mobileStatus()) } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 border-t border-ink-faint/20 pt-5">
    <div><h2 className="text-lg font-semibold text-ink">Crest for iPhone</h2>
      <p className="text-sm text-ink-muted mt-2">Chat with Qwen and edit laptop files from your phone. Same Wi-Fi, encrypted pairing, no inference API bill.</p></div>
    <button disabled={busy} onClick={() => action(async () => { await window.api.mobileEnable(!status?.enabled); setPairing(null) })}
      className="rounded-lg px-4 py-2 bg-ink/10 text-sm text-ink disabled:opacity-50">{status?.enabled ? 'Turn off iPhone access' : 'Enable iPhone access'}</button>
    {status?.running && <>
      <p className="text-sm text-emerald-400">Ready at {status.url}</p>
      <div className="flex gap-2"><button disabled={busy} onClick={() => action(async () => setPairing(await window.api.mobilePair()))} className="rounded-lg px-4 py-2 bg-emerald-500/20 text-emerald-300 text-sm">Pair an iPhone</button>
        <button disabled={busy} onClick={() => action(() => window.api.mobileAddProject())} className="rounded-lg px-4 py-2 bg-ink/10 text-ink text-sm">Allow a project</button></div>
      {pairing && Date.parse(pairing.expiresAt) > Date.now() && <div className="space-y-2 rounded-xl bg-ink/5 p-4">
        <img src={pairing.qrDataURL} alt="One-time iPhone pairing QR code" className="w-60 h-60 rounded-lg" />
        <p className="text-sm text-ink-muted">In Crest on your iPhone, tap Scan laptop QR. This code expires in five minutes and can be used once.</p>
        <details className="text-sm text-ink-muted"><summary>Manual pairing link</summary><code className="block break-all select-all text-xs mt-2">{pairing.url}</code></details>
      </div>}
      <div className="space-y-2"><h3 className="text-sm font-medium text-ink">Allowed projects</h3>{status.projects.map(p => <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
        <div><p className="text-ink">{p.name}</p><p className="text-xs text-ink-muted break-all">{p.path}</p></div>
        <button disabled={busy} onClick={() => action(() => window.api.mobileRemoveProject(p.id))} className="text-ink-muted">Remove</button></div>)}</div>
      <div className="space-y-2"><h3 className="text-sm font-medium text-ink">Paired devices</h3>{!status.devices.length && <p className="text-sm text-ink-muted">No phones paired yet.</p>}{status.devices.map(d => <div key={d.id} className="flex justify-between text-sm">
        <span className="text-ink">{d.name}</span><button disabled={busy} onClick={() => action(() => window.api.mobileRevoke(d.id))} className="text-red-400">Revoke</button></div>)}</div>
    </>}
    {(error || status?.error) && <p role="alert" className="text-sm text-red-400">{error || status?.error}</p>}
  </section>
}
