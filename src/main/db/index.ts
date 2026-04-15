import Database from 'better-sqlite3'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { initializeSchema } from './schema'

let db: Database.Database | null = null

function resolveDbPath(): string {
  // Try to find the OneDrive folder automatically
  const home = os.homedir()
  const candidates = [
    path.join(home, 'OneDrive - Euna Solutions', 'Documents', 'Projects', 'cowork-codex-data'),
    path.join(home, 'OneDrive', 'Documents', 'Projects', 'cowork-codex-data'),
    path.join(home, 'Documents', 'Projects', 'cowork-codex-data')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.join(candidate, 'cowork-codex.db')
    }
  }

  // Fallback: use app data directory
  const fallback = path.join(app.getPath('userData'), 'cowork-codex.db')
  console.warn('Could not find OneDrive data folder. Using fallback:', fallback)
  return fallback
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(customPath?: string): void {
  const dbPath = customPath || resolveDbPath()
  const dbDir = path.dirname(dbPath)

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)
  initializeSchema(db)

  // Save the path to settings for future reference
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('dbPath', ?)").run(dbPath)

  console.log('Database initialized at:', dbPath)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function backupDb(): void {
  if (!db) return

  const dbPath = (db.prepare("SELECT value FROM settings WHERE key = 'dbPath'").get() as { value: string })?.value
  if (!dbPath) return

  const backupDir = path.join(path.dirname(dbPath), 'backups')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const date = new Date().toISOString().split('T')[0]
  const backupPath = path.join(backupDir, `cowork-codex-backup-${date}.db`)

  // Only backup once per day
  if (!fs.existsSync(backupPath)) {
    db.backup(backupPath)
    console.log('Database backed up to:', backupPath)
    pruneOldBackups(backupDir)
  }
}

function pruneOldBackups(backupDir: string): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('cowork-codex-backup-') && f.endsWith('.db'))
    .sort()
    .reverse()

  // Keep only the 7 most recent backups
  files.slice(7).forEach((file) => {
    fs.unlinkSync(path.join(backupDir, file))
    console.log('Pruned old backup:', file)
  })
}
