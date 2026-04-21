import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, CheckCircle, XCircle, Loader } from 'lucide-react'

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

export default function Settings(): React.JSX.Element {
  const [orgUrl, setOrgUrl] = useState('')
  const [project, setProject] = useState('')
  const [pat, setPat] = useState('')
  const [hasPat, setHasPat] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [saved, setSaved] = useState(false)

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

  const inputClass = 'w-full bg-[#1a1a1a] border border-[#383838] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#444] outline-none focus:border-accent transition-colors'
  const labelClass = 'block text-xs text-[#888] mb-1.5'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[#383838] flex-shrink-0">
        <SettingsIcon size={14} className="text-[#888]" />
        <h1 className="text-sm font-medium text-[#d0d0d0]">Settings</h1>
      </div>

      <div className="px-6 py-6 max-w-lg space-y-8">

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
              <p className="text-xs text-[#555] mt-1.5">
                Only needs <span className="text-[#777]">Work Items — Read</span> scope.
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
                className="px-4 py-2 rounded-lg border border-[#383838] text-sm text-[#aaa] hover:text-white hover:border-[#555] transition-all disabled:opacity-40"
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
                <Loader size={13} className="text-[#888] animate-spin" />
              )}
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-[#2a2a2a]" />

        {/* About */}
        <section>
          <h2 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">About</h2>
          <p className="text-xs text-[#555]">Cowork Codex — personal dev notepad</p>
        </section>
      </div>
    </div>
  )
}
