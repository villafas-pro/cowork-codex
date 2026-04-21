import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, CheckCircle, XCircle, Loader } from 'lucide-react'
import { useAppStore, type EditorFontSize } from '../store/appStore'

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

export default function Settings(): React.JSX.Element {
  const [orgUrl, setOrgUrl] = useState('')
  const [project, setProject] = useState('')
  const [pat, setPat] = useState('')
  const [hasPat, setHasPat] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const { editorFontSize, setEditorFontSize, theme, toggleTheme } = useAppStore()

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig(): Promise<void> {
    const config = await window.api?.ado.getConfig()
    if (config) {
      setOrgUrl(config.orgUrl || '')
      setProject(config.project || '')
      setHasPat(!!config.hasPat)
    }
  }

  async function save(): Promise<void> {
    if (!orgUrl.trim() || !project.trim()) return
    await window.api?.ado.setConfig({
      orgUrl: orgUrl.trim(),
      project: project.trim(),
      pat: pat.trim() || undefined
    })
    setSaved(true)
    setHasPat(pat.trim() ? true : hasPat)
    setPat('')
    setTimeout(() => setSaved(false), 2000)
  }

  async function testConnection(): Promise<void> {
    setTestStatus('testing')
    setTestMessage('')
    const result = await window.api?.ado.testConnection()
    if (result?.success) {
      setTestStatus('ok')
      setTestMessage(`Connected to "${result.projectName}"`)
    } else {
      setTestStatus('error')
      setTestMessage(result?.error || 'Connection failed')
    }
  }

  const inputClass = 'w-full bg-th-bg-3 border border-th-bd-2 rounded-lg px-3 py-2 text-sm text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent transition-colors'
  const labelClass = 'block text-xs text-th-tx-4 mb-1.5'

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

        {/* Azure DevOps */}
        <section>
          <h2 className="text-xs font-semibold text-[#e8b800] uppercase tracking-wider mb-4">
            Azure DevOps
          </h2>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Organization URL</label>
              <input
                value={orgUrl}
                onChange={(e) => setOrgUrl(e.target.value)}
                placeholder="https://dev.azure.com/YourOrg"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Project</label>
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Questica"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Personal Access Token
                {hasPat && <span className="ml-2 text-[#e8b800]">· saved</span>}
              </label>
              <input
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                type="password"
                placeholder={hasPat ? 'Enter new token to replace existing' : 'Paste your PAT here'}
                className={inputClass}
              />
              <p className="text-xs text-th-tx-6 mt-1.5">
                Only needs <span className="text-th-tx-4">Work Items — Read</span> scope.
                Create at dev.azure.com → Profile → Personal access tokens.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={!orgUrl.trim() || !project.trim()}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-black text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saved ? 'Saved!' : 'Save'}
              </button>

              <button
                onClick={testConnection}
                disabled={testStatus === 'testing'}
                className="px-4 py-2 rounded-lg border border-th-bd-2 text-sm text-th-tx-3 hover:text-th-tx-1 hover:border-th-bd-3 transition-all disabled:opacity-40"
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test connection'}
              </button>

              {testStatus === 'ok' && (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle size={13} />
                  {testMessage}
                </div>
              )}
              {testStatus === 'error' && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <XCircle size={13} />
                  {testMessage}
                </div>
              )}
              {testStatus === 'testing' && (
                <Loader size={13} className="text-th-tx-4 animate-spin" />
              )}
            </div>
          </div>
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
              A personal desktop workspace for developers — notes, code snippets, flow diagrams,
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
