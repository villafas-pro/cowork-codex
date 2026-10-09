import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle, Loader } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { HooksStatus } from '../../lib/pipelineUi'

type Note = { ok: boolean; text: string } | null

const labelClass = 'block text-xs text-th-tx-4 mb-1.5'
const inputClass =
  'w-full bg-th-bg-2 border border-th-bd-2 rounded-lg px-3 py-2 text-sm text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent'
const buttonClass =
  'px-3 py-1.5 rounded-lg border border-th-bd-2 text-xs text-th-tx-3 hover:text-th-tx-1 hover:bg-th-bg-5 disabled:opacity-50'

function Result({ note }: { note: Note }): React.JSX.Element | null {
  if (!note) return null
  return (
    <p className={`mt-2 flex items-start gap-1.5 text-xs ${note.ok ? 'text-green-400' : 'text-amber-400'}`}>
      {note.ok ? <CheckCircle size={13} className="mt-0.5 flex-shrink-0" /> : <XCircle size={13} className="mt-0.5 flex-shrink-0" />}
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{note.text}</span>
    </p>
  )
}

/** Settings for the Pipeline dashboard: GitHub token, Claude Code hooks, alerts, Rivet's account name. */
export default function PipelineSettings(): React.JSX.Element {
  const { showConfirm } = useAppStore()

  // GitHub
  const [ghStatus, setGhStatus] = useState<{ hasToken: boolean; unreadable: boolean } | null>(null)
  const [token, setToken] = useState('')
  const [ghBusy, setGhBusy] = useState(false)
  const [ghNote, setGhNote] = useState<Note>(null)

  // Hooks
  const [hooks, setHooks] = useState<HooksStatus | null>(null)
  const [hooksBusy, setHooksBusy] = useState(false)
  const [hooksNote, setHooksNote] = useState<Note>(null)

  // Alerts and Rivet name
  const [alerts, setAlerts] = useState(true)
  const [rivet, setRivet] = useState('')
  const [rivetSaved, setRivetSaved] = useState(false)

  const loadHooks = useCallback(async () => setHooks((await window.api?.pipeline.hooksStatus()) ?? null), [])

  useEffect(() => {
    window.api?.pipeline.githubStatus().then(setGhStatus)
    loadHooks()
    window.api?.settings.get('pipeline_notifications').then((v) => setAlerts(v !== '0'))
    window.api?.pipeline.rivetAuthor().then(setRivet)
  }, [loadHooks])

  async function saveToken(): Promise<void> {
    setGhBusy(true)
    setGhNote(null)
    try {
      const status = await window.api?.pipeline.githubSave(token)
      if (status) setGhStatus(status)
      setToken('')
      if (status?.hasToken) {
        const t = await window.api?.pipeline.githubTest()
        setGhNote(t?.success ? { ok: true, text: t.detail ?? 'Token works' } : { ok: false, text: t?.error ?? 'Token saved, but the test failed' })
      } else {
        setGhNote({ ok: true, text: 'Token removed.' })
      }
    } finally {
      setGhBusy(false)
    }
  }

  async function testToken(): Promise<void> {
    setGhBusy(true)
    const t = await window.api?.pipeline.githubTest()
    setGhNote(t?.success ? { ok: true, text: t.detail ?? 'Token works' } : { ok: false, text: t?.error ?? 'Test failed' })
    setGhBusy(false)
  }

  async function installHooks(): Promise<void> {
    if (!hooks) return
    const ok = await showConfirm(
      `This adds four hooks (session start, prompt, stop, session end) to Claude Code's settings file:\n\n${hooks.settingsPath}\n\n` +
      'Your existing settings and hooks are kept, and the original file is backed up next to it first. ' +
      'The hooks only record which ticket a session is working on, so the Pipeline can show it as Local.'
    )
    if (!ok) return
    setHooksBusy(true)
    setHooksNote(null)
    const r = await window.api?.pipeline.hooksInstall()
    setHooksNote(r?.success ? { ok: true, text: 'Installed. Start a new Claude Code session for it to take effect.' } : { ok: false, text: (r && 'error' in r ? r.error : 'Install failed') })
    await loadHooks()
    setHooksBusy(false)
  }

  async function removeHooks(): Promise<void> {
    setHooksBusy(true)
    setHooksNote(null)
    const r = await window.api?.pipeline.hooksRemove()
    setHooksNote(r?.success ? { ok: true, text: 'Removed. Other settings were left alone.' } : { ok: false, text: (r && 'error' in r ? r.error : 'Remove failed') })
    await loadHooks()
    setHooksBusy(false)
  }

  async function toggleAlerts(): Promise<void> {
    const next = !alerts
    setAlerts(next)
    await window.api?.settings.set('pipeline_notifications', next ? '1' : '0')
  }

  async function saveRivet(): Promise<void> {
    await window.api?.settings.set('pipeline_rivet_author', rivet.trim() || 'Rivet Factory Agent')
    setRivetSaved(true)
    setTimeout(() => setRivetSaved(false), 2000)
  }

  return (
    <section>
      <h2 className="text-xs font-semibold text-[#e8b800] uppercase tracking-wider mb-4">Pipeline</h2>

      <div className="space-y-6">
        {/* GitHub */}
        <div>
          <label className={labelClass}>GitHub token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={ghStatus?.hasToken ? 'Saved. Enter a new one to replace it' : 'github_pat_...'}
              className={inputClass}
              autoComplete="off"
            />
            <button onClick={saveToken} disabled={ghBusy || (!token.trim() && !ghStatus?.hasToken)} className={buttonClass}>
              {ghBusy ? <Loader size={12} className="animate-spin" /> : token.trim() ? 'Save' : 'Remove'}
            </button>
            {ghStatus?.hasToken && !token.trim() && <button onClick={testToken} disabled={ghBusy} className={buttonClass}>Test</button>}
          </div>
          {ghStatus?.unreadable && (
            <p className="mt-2 text-xs text-amber-400">A token is stored but cannot be read on this computer. Enter it again.</p>
          )}
          <Result note={ghNote} />
          <p className="mt-2 text-xs text-th-tx-5 leading-relaxed">
            Lets the Pipeline show a PR as draft, in review, or merged. Create a fine-grained token at github.com, Settings, Developer settings, with read-only access to the repos you use
            (Pull requests: read, Contents: read). If your organization uses SSO, authorize the token for it. Stored encrypted on this PC.
          </p>
        </div>

        {/* Claude Code hooks */}
        <div>
          <label className={labelClass}>Claude Code sessions</label>
          <div className="rounded-lg border border-th-bd-2 bg-th-bg-3 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              {hooks?.installed ? (
                <span className="flex items-center gap-1.5 text-green-400"><CheckCircle size={13} /> Hooks installed</span>
              ) : (
                <span className="flex items-center gap-1.5 text-th-tx-4"><XCircle size={13} /> Not installed</span>
              )}
              <span className="flex-1" />
              {hooks?.installed ? (
                <button onClick={removeHooks} disabled={hooksBusy} className={buttonClass}>Remove</button>
              ) : (
                <button onClick={installHooks} disabled={hooksBusy || !hooks} className={buttonClass}>Install hooks</button>
              )}
            </div>
            {hooks && !hooks.nodeAvailable && (
              <p className="text-xs text-amber-400">
                Node.js was not found on the PATH. The hook runs with <span className="font-mono">node</span>, so install Node.js or the hooks will do nothing.
              </p>
            )}
            {hooks && !hooks.settingsReadable && (
              <p className="text-xs text-amber-400">Claude Code's settings file could not be read as JSON, so hooks cannot be installed until it is fixed.</p>
            )}
            <p className="text-[11px] text-th-tx-5 break-words [overflow-wrap:anywhere]">
              Open session button:{' '}
              {hooks?.claude.found
                ? hooks.claude.canOpenInDesktop
                  ? `available (Claude Code ${hooks.claude.version})`
                  : `needs Claude Code 2.1.285 or newer (found ${hooks.claude.version ?? 'unknown'})`
                : 'needs the claude command on the PATH'}
            </p>
          </div>
          <Result note={hooksNote} />
          <p className="mt-2 text-xs text-th-tx-5 leading-relaxed">
            A ticket shows as Local while a Claude Code session is working on it. The ticket is found from the git branch name (like ob-12064-fix) or a key you mention in a prompt.
            Works for the terminal and the Desktop app.
          </p>
        </div>

        {/* Alerts */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-th-tx-2">Desktop alerts</p>
            <p className="text-xs text-th-tx-5 mt-0.5">PR ready, review activity, merged, PR closed, or stuck too long. Muted categories never alert.</p>
          </div>
          <button
            onClick={toggleAlerts}
            role="switch"
            aria-checked={alerts}
            className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${alerts ? 'bg-accent' : 'bg-th-bg-6'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${alerts ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Rivet account name */}
        <div>
          <label className={labelClass}>Rivet account name in Jira</label>
          <div className="flex gap-2">
            <input value={rivet} onChange={(e) => setRivet(e.target.value)} className={inputClass} />
            <button onClick={saveRivet} className={buttonClass}>{rivetSaved ? 'Saved' : 'Save'}</button>
          </div>
          <p className="mt-2 text-xs text-th-tx-5">Only comments from this name count as Rivet activity. Change it if the bot account is renamed.</p>
        </div>
      </div>
    </section>
  )
}
