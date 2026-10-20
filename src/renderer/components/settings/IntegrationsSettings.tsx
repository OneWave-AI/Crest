import { useEffect, useState } from 'react'

export default function IntegrationsSettings() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.api.integrationStatus>> | null>(null)
  useEffect(() => {
    const refresh = () => window.api.integrationStatus().then(setInfo).catch(() => setInfo(null))
    void refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Local API &amp; MCP</h2>
        <p className="text-sm text-ink-muted mt-2">Let Claude Code, Codex, and other tools send coding tasks to local models on this laptop. Keep Crest open while connected.</p>
      </div>
      <div className="rounded-xl border border-ink-faint/20 p-4 space-y-3 text-sm">
        <p className={info?.running ? 'text-emerald-400' : 'text-amber-400'}>{info?.running ? 'Running on this laptop' : info?.error || 'Waiting for the local service…'}</p>
        {info?.running && <>
          <p className="text-ink-muted">API <code className="block text-ink select-all break-all">{info.url}/v1</code></p>
          <p className="text-ink-muted">MCP <code className="block text-ink select-all break-all">{info.mcpUrl}</code></p>
          <p className="text-ink-muted">Bearer token file <code className="block text-ink select-all break-all">{info.tokenPath}</code></p>
        </>}
      </div>
      <div className="text-sm text-ink-muted space-y-3">
        <p>Use the MCP tools to list models, start a task, check its result, or cancel it. Each task specifies a project folder and the files Qwen may read or edit.</p>
        <p>Review mode answers without changing files. Edit mode saves the original contents before writing changes. Your calling agent reviews the diff and runs tests.</p>
        <p>Inference runs through local Ollama. Claude and Codex still use their own plan limits when coordinating tasks.</p>
        <p>Both connections require the token in an <code>Authorization: Bearer</code> header. Connection examples are in the repository’s <code>docs/local-api.md</code>.</p>
      </div>
    </section>
  )
}
