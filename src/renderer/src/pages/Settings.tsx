import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, CheckCircle, XCircle, Loader, Pencil, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { useAppStore, type EditorFontSize } from '../store/appStore'
import { PROVIDER_LABELS, type ConnectionInfo } from '../lib/workItemUtils'

type Provider = 'jira' | 'ado'

interface FormState {
  id?: string
  provider: Provider
  name: string
  baseUrl: string
  project: string
  email: string
  secret: string
}

const emptyForm = (provider: Provider = 'jira'): FormState => ({
  provider, name: '', baseUrl: '', project: '', email: '', secret: ''
})

interface TestResult { ok: boolean; message: string }

export default function Settings(): React.JSX.Element {
  const { editorFontSize, setEditorFontSize, theme, toggleTheme, setIntegrationStatus, showConfirm } = useAppStore()
  const [connections, setConnections] = useState<ConnectionInfo[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, TestResult>>({})

  useEffect(() => {
    loadConnections()
  }, [])

  async function loadConnections(): Promise<void> {
    setConnections((await window.api?.integrations.getConnections()) || [])
  }

  // Keep the sidebar warning dot in step with changes made here
  async function refreshStatus(): Promise<void> {
    const r = await window.api?.integrations.checkAll()
    if (!r?.configured) setIntegrationStatus('unconfigured')
    else setIntegrationStatus(r.ok ? 'ok' : 'error', r.failures)
  }

  function startEdit(c: ConnectionInfo): void {
    setFormError('')
    setForm({
      id: c.id, provider: c.provider, name: c.name, baseUrl: c.baseUrl,
      project: c.project, email: c.email, secret: ''
    })
  }

  async function test(id: string): Promise<void> {
    setTesting(id)
    try {
      const r = await window.api?.integrations.testConnection(id)
      setResults((prev) => ({
        ...prev,
        [id]: r?.success
          ? { ok: true, message: r.detail || 'Connected' }
          : { ok: false, message: r?.error || 'Connection failed' }
      }))
    } finally {
      setTesting(null)
    }
  }

  async function save(): Promise<void> {
    if (!form) return
    setSaving(true)
    setFormError('')
    try {
      const res = await window.api?.integrations.saveConnection({
        id: form.id,
        provider: form.provider,
        name: form.name,
        baseUrl: form.baseUrl,
        project: form.project,
        email: form.email,
        secret: form.secret
      })
      if (!res || !res.success) {
        setFormError(res && !res.success ? res.error : 'Could not save')
        return
      }
      setForm(null)
      await loadConnections()
      await test(res.id)
      await refreshStatus()
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: ConnectionInfo): Promise<void> {
    if (!await showConfirm(`Remove "${c.name}"? Linked items keep their saved details, but won't refresh.`)) return
    await window.api?.integrations.deleteConnection(c.id)
    await loadConnections()
    await refreshStatus()
  }

  const inputClass = 'w-full bg-th-bg-3 border border-th-bd-2 rounded-lg px-3 py-2 text-sm text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent transition-colors'
  const labelClass = 'block text-xs text-th-tx-4 mb-1.5'
  const set = (patch: Partial<FormState>): void => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-th-bd-2 flex-shrink-0">
        <SettingsIcon size={14} className="text-th-tx-4" />
        <h1 className="text-sm font-medium text-th-tx-2">Settings</h1>
      </div>

      <div className="px-6 py-6 max-w-lg space-y-8">

        {/* Appearance */}
        <section>
          <h2 className="text-xs font-semibold text-[#e8b800] uppercase tracking-wider mb-4">
            Appearance
          </h2>

          <div className="space-y-5">
            {/* Theme */}
            <div>
              <label className={labelClass}>Theme</label>
              <div className="flex gap-2">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => theme !== t && toggleTheme()}
                    className={`px-4 py-2 rounded-lg text-sm transition-all capitalize ${
                      theme === t
                        ? 'bg-accent text-black font-semibold'
                        : 'bg-th-bg-3 border border-th-bd-2 text-th-tx-4 hover:text-th-tx-2 hover:border-th-bd-3'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor font size */}
            <div>
              <label className={labelClass}>Editor font size</label>
              <div className="flex gap-2">
                {([
                  { key: 'small', label: 'Small', hint: '13px' },
                  { key: 'medium', label: 'Medium', hint: '15px' },
                  { key: 'large', label: 'Large', hint: '17px' },
                ] as { key: EditorFontSize; label: string; hint: string }[]).map(({ key, label, hint }) => (
                  <button
                    key={key}
                    onClick={() => setEditorFontSize(key)}
                    className={`flex flex-col items-center px-5 py-2.5 rounded-lg text-sm transition-all ${
                      editorFontSize === key
                        ? 'bg-accent text-black font-semibold'
                        : 'bg-th-bg-3 border border-th-bd-2 text-th-tx-4 hover:text-th-tx-2 hover:border-th-bd-3'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[10px] mt-0.5 ${editorFontSize === key ? 'text-black/60' : 'text-th-tx-6'}`}>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-th-bd-1" />

        {/* Work item connections */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-[#e8b800] uppercase tracking-wider">
              Work item connections
            </h2>
            {!form && (
              <button
                onClick={() => { setFormError(''); setForm(emptyForm()) }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-th-bd-2 text-xs text-th-tx-3 hover:text-th-tx-1 hover:border-th-bd-3 transition-all"
              >
                <Plus size={12} />
                Add connection
              </button>
            )}
          </div>

          {connections.length === 0 && !form && (
            <p className="text-xs text-th-tx-5">
              No connections yet. Add Jira or Azure DevOps to link, search and track work items.
            </p>
          )}

          <div className="space-y-2">
            {connections.map((c) => {
              const r = results[c.id]
              return (
                <div key={c.id} className="rounded-lg border border-th-bd-2 bg-th-bg-3 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-th-bd-2 text-th-tx-3">
                      {PROVIDER_LABELS[c.provider]}
                    </span>
                    <span className="text-sm text-th-tx-1 truncate flex-1">{c.name}</span>
                    <button
                      onClick={() => test(c.id)}
                      disabled={testing === c.id}
                      className="px-2 py-1 rounded border border-th-bd-2 text-[11px] text-th-tx-3 hover:text-th-tx-1 disabled:opacity-40"
                    >
                      {testing === c.id ? 'Testing...' : 'Test'}
                    </button>
                    <button onClick={() => startEdit(c)} className="p-1.5 rounded text-th-tx-5 hover:text-th-tx-1" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => remove(c)} className="p-1.5 rounded text-th-tx-5 hover:text-red-400" title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="text-[11px] text-th-tx-5 mt-1 truncate">
                    {c.baseUrl}{c.project ? ` · ${c.project}` : ''}{c.email ? ` · ${c.email}` : ''}
                  </p>
                  {c.secretUnreadable && (
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-500 mt-1.5">
                      <AlertTriangle size={11} />
                      Saved token can't be read on this computer. Edit and enter it again.
                    </p>
                  )}
                  {testing === c.id && <Loader size={12} className="text-th-tx-4 animate-spin mt-1.5" />}
                  {r && testing !== c.id && (
                    <p className={`flex items-center gap-1.5 text-[11px] mt-1.5 ${r.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {r.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {r.message}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {form && (
            <div className="mt-3 rounded-lg border border-th-bd-3 bg-th-bg-3 p-4 space-y-4">
              {!form.id && (
                <div>
                  <label className={labelClass}>Type</label>
                  <div className="flex gap-2">
                    {(['jira', 'ado'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setForm(emptyForm(p))}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          form.provider === p
                            ? 'bg-accent text-black font-semibold'
                            : 'bg-th-bg-2 border border-th-bd-2 text-th-tx-4 hover:text-th-tx-2'
                        }`}
                      >
                        {PROVIDER_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>{form.provider === 'jira' ? 'Jira site URL' : 'Organization URL'}</label>
                <input
                  value={form.baseUrl}
                  onChange={(e) => set({ baseUrl: e.target.value })}
                  placeholder={form.provider === 'jira' ? 'https://your-site.atlassian.net' : 'https://dev.azure.com/your-organization'}
                  className={inputClass}
                />
                {form.provider === 'jira' && (
                  <p className="text-[11px] text-th-tx-6 mt-1.5">
                    You can paste any Jira page link. The site and project are picked out of it.
                  </p>
                )}
              </div>

              {form.provider === 'jira' ? (
                <>
                  <div>
                    <label className={labelClass}>Atlassian account email</label>
                    <input
                      value={form.email}
                      onChange={(e) => set({ email: e.target.value })}
                      placeholder="you@company.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Project keys (optional)</label>
                    <input
                      value={form.project}
                      onChange={(e) => set({ project: e.target.value })}
                      placeholder="OB, XY (leave blank to search all projects)"
                      className={inputClass}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className={labelClass}>Project</label>
                  <input
                    value={form.project}
                    onChange={(e) => set({ project: e.target.value })}
                    placeholder="your-project"
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className={labelClass}>
                  {form.provider === 'jira' ? 'API token' : 'Personal access token'}
                </label>
                <input
                  value={form.secret}
                  onChange={(e) => set({ secret: e.target.value })}
                  type="password"
                  placeholder={form.id ? 'Leave blank to keep the saved token' : 'Paste your token here'}
                  className={inputClass}
                />
                <p className="text-[11px] text-th-tx-6 mt-1.5">
                  {form.provider === 'jira' ? (
                    <>Create one at id.atlassian.com → Security → API tokens. Read access is enough.</>
                  ) : (
                    <>Only needs <span className="text-th-tx-4">Work Items: Read</span>. Create at dev.azure.com → Profile → Personal access tokens.</>
                  )}{' '}
                  Tokens are encrypted with Windows before they are stored.
                </p>
              </div>

              <div>
                <label className={labelClass}>Name (optional)</label>
                <input
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Shown in search filters"
                  className={inputClass}
                />
              </div>

              {formError && <p className="text-xs text-red-400">{formError}</p>}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving || !form.baseUrl.trim()}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-black text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save and test'}
                </button>
                <button
                  onClick={() => { setForm(null); setFormError('') }}
                  className="px-4 py-2 rounded-lg border border-th-bd-2 text-sm text-th-tx-3 hover:text-th-tx-1 hover:border-th-bd-3 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-th-bd-1" />

        {/* About */}
        <section>
          <h2 className="text-xs font-semibold text-[#e8b800] uppercase tracking-wider mb-4">About</h2>
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-th-tx-1">Cowork Codex</span>
              <span className="text-xs text-th-tx-5">v1.0.0</span>
            </div>
            <p className="text-xs text-th-tx-4 leading-relaxed">
              A personal desktop workspace for developers: notes, code snippets, flow diagrams,
              and work item tracking, all in one place.
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
              {[
                ['Runtime', 'Electron 29'],
                ['UI', 'React 18 + TypeScript'],
                ['Editor', 'TipTap 2 · Monaco'],
                ['Database', 'SQLite (better-sqlite3)'],
                ['Diagrams', 'ReactFlow 11'],
                ['State', 'Zustand'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-th-tx-6 w-16 flex-shrink-0">{label}</span>
                  <span className="text-[10px] text-th-tx-4">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
