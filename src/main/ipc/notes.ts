import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { getDb } from '../db'
import type { Note } from '@shared/types'

// ─── Encryption helpers ───────────────────────────────────────────────────────

/** Derive a 32-byte AES key from a password + salt using scrypt. */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32) as Buffer
}

/** AES-256-GCM encrypt. Returns a JSON string containing iv, authTag, and ciphertext (all hex). */
function encryptContent(plaintext: string, password: string, salt: Buffer): string {
  const key = deriveKey(password, salt)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted.toString('hex'),
  })
}

/** AES-256-GCM decrypt. Throws if the password is wrong (auth tag mismatch). */
function decryptContent(encryptedJson: string, password: string, salt: Buffer): string {
  const { iv, tag, data } = JSON.parse(encryptedJson) as { iv: string; tag: string; data: string }
  const key = deriveKey(password, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

/** Hash a password with a given salt using scrypt. Returns hex string. */
function hashPassword(password: string, salt: Buffer): string {
  return (crypto.scryptSync(password, salt, 64) as Buffer).toString('hex')
}

/** Constant-time password verification. */
function verifyPassword(password: string, saltHex: string, storedHash: string): boolean {
  try {
    const hash = hashPassword(password, Buffer.from(saltHex, 'hex'))
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
  } catch {
    return false
  }
}

// ─── Session password store (in-memory, cleared on app quit) ─────────────────
// Maps noteId → plaintext password for notes unlocked this session.
const sessionPasswords = new Map<string, string>()

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerNoteHandlers(): void {
  // Get all notes
  ipcMain.handle('notes:getAll', () => {
    const db = getDb()
    // Return all notes; content is not decrypted here (list view doesn't need it).
    // Expose has_password flag, linked_work_item_count, and has_active_work_items for home page.
    // has_active_work_items is ADO-aware: ADO items use cached_state, non-ADO use is_done.
    return (db.prepare(`
      SELECT n.*,
        (SELECT COUNT(*)
         FROM work_item_links wil
         WHERE wil.entity_type = 'note' AND wil.entity_id = n.id
        ) AS linked_work_item_count,
        (SELECT COUNT(*)
         FROM work_item_links wil
         JOIN work_items wi ON wi.id = wil.work_item_id
         LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
         WHERE wil.entity_type = 'note' AND wil.entity_id = n.id
           AND CASE
             WHEN wi.url LIKE '%dev.azure.com%' AND cwi.state IS NOT NULL
               THEN cwi.state NOT IN ('Closed','Resolved','Done','Removed')
             ELSE wi.is_done = 0
           END
        ) AS active_work_item_count
      FROM notes n
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `).all() as Record<string, unknown>[])
      .map((n) => ({ ...n, has_password: n.password_hash != null ? 1 : 0 }))
  })

  // Get single note.
  // Password-protected notes always return with is_password_locked: 1 and empty content —
  // the renderer must call notes:unlock to get the real content. The session password is
  // only used silently on save (notes:update) so re-encryption is transparent.
  ipcMain.handle('notes:get', (_, id: string) => {
    const db = getDb()
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as {
      id: string; title: string; content: string
      is_pinned: number; is_locked: number; all_work_items_done: number
      created_at: number; updated_at: number
      password_hash: string | null; password_salt: string | null
    } | undefined
    if (!note) return null

    if (note.password_hash) {
      return { ...note, content: '{}', has_password: 1, is_password_locked: 1 }
    }

    return { ...note, has_password: 0, is_password_locked: 0 }
  })

  // Create note
  ipcMain.handle('notes:create', (_, data: Partial<Note>) => {
    const db = getDb()
    const id = uuidv4()
    const now = Date.now()
    const title = data.title || 'Untitled'
    const content = data.content || '{}'
    db.prepare(`
      INSERT INTO notes (id, title, content, created_at, updated_at, is_pinned)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, title, content, now, now)
    db.prepare('INSERT OR REPLACE INTO notes_fts(id, title, content) VALUES (?, ?, ?)').run(id, title, content)
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  })

  // Update note — re-encrypts content if the note has a password and is unlocked
  ipcMain.handle('notes:update', (_, id: string, data: Partial<Note>) => {
    const db = getDb()
    const now = Date.now()
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as {
      title: string; content: string
      is_pinned: number; is_locked: number; all_work_items_done: number
      created_at: number; updated_at: number
      password_hash: string | null; password_salt: string | null
    } | undefined
    if (!note) return null

    // Refuse edits on simply-locked notes
    if (note.is_locked) return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)

    // Password-protected: only allow update if unlocked this session
    if (note.password_hash) {
      const sessionPw = sessionPasswords.get(id)
      if (!sessionPw) return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
      // Re-encrypt the incoming content before storing
      const salt = Buffer.from(note.password_salt!, 'hex')
      const plaintextContent = data.content ?? (() => {
        try { return decryptContent(note.content, sessionPw, salt) } catch { return '{}' }
      })()
      const encryptedContent = encryptContent(plaintextContent, sessionPw, salt)
      const newTitle = data.title ?? note.title

      // Version history (using plaintext so versions are readable after unlock)
      _saveVersion(db, id, note.content, now)

      db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?')
        .run(newTitle, encryptedContent, now, id)
      // FTS: index title only for password-protected notes (content stays private)
      db.prepare('INSERT OR REPLACE INTO notes_fts(id, title, content) VALUES (?, ?, ?)').run(id, newTitle, '')
      return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    }

    // Plain note update
    const newTitle = data.title ?? note.title
    const newContent = data.content ?? note.content

    // Nothing changed — skip the write and don't create a spurious version snapshot
    if (newContent === note.content && newTitle === note.title) {
      return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    }

    _saveVersion(db, id, note.content, now)

    db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ?, is_pinned = ? WHERE id = ?')
      .run(newTitle, newContent, now, note.is_pinned, id)
    db.prepare('INSERT OR REPLACE INTO notes_fts(id, title, content) VALUES (?, ?, ?)').run(id, newTitle, newContent)
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  })

  // Delete note
  ipcMain.handle('notes:delete', (_, id: string) => {
    const db = getDb()
    sessionPasswords.delete(id)
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    db.prepare('DELETE FROM notes_fts WHERE id = ?').run(id)
    return { success: true }
  })

  // Toggle pin
  ipcMain.handle('notes:togglePin', (_, id: string) => {
    const db = getDb()
    const note = db.prepare('SELECT is_pinned FROM notes WHERE id = ?').get(id) as { is_pinned: number }
    const newVal = note.is_pinned ? 0 : 1
    db.prepare('UPDATE notes SET is_pinned = ? WHERE id = ?').run(newVal, id)
    return { isPinned: newVal }
  })

  // Toggle lock
  ipcMain.handle('notes:toggleLock', (_, id: string) => {
    const db = getDb()
    const note = db.prepare('SELECT is_locked FROM notes WHERE id = ?').get(id) as { is_locked: number } | undefined
    if (!note) return null
    const newVal = note.is_locked ? 0 : 1
    db.prepare('UPDATE notes SET is_locked = ? WHERE id = ?').run(newVal, id)
    return { isLocked: newVal }
  })

  // Unlock a password-protected note — verifies the password and stores it in the session
  ipcMain.handle('notes:unlock', (_, id: string, password: string) => {
    const db = getDb()
    const note = db.prepare('SELECT content, password_hash, password_salt FROM notes WHERE id = ?').get(id) as {
      content: string; password_hash: string | null; password_salt: string | null
    } | undefined
    if (!note?.password_hash) return { success: false, error: 'Note has no password' }

    if (!verifyPassword(password, note.password_salt!, note.password_hash)) {
      return { success: false, error: 'Incorrect password' }
    }

    try {
      const decrypted = decryptContent(note.content, password, Buffer.from(note.password_salt!, 'hex'))
      sessionPasswords.set(id, password)
      return { success: true, content: decrypted }
    } catch {
      return { success: false, error: 'Failed to decrypt note' }
    }
  })

  // Set or change password — encrypts content with the new password
  ipcMain.handle('notes:setPassword', (_, id: string, newPassword: string) => {
    const db = getDb()
    const note = db.prepare('SELECT content, password_hash, password_salt FROM notes WHERE id = ?').get(id) as {
      content: string; password_hash: string | null; password_salt: string | null
    } | undefined
    if (!note) return { success: false, error: 'Note not found' }

    // Get the plaintext content
    let plaintext = note.content
    if (note.password_hash) {
      const sessionPw = sessionPasswords.get(id)
      if (!sessionPw) return { success: false, error: 'Note must be unlocked before changing its password' }
      try {
        plaintext = decryptContent(note.content, sessionPw, Buffer.from(note.password_salt!, 'hex'))
      } catch {
        return { success: false, error: 'Failed to decrypt current content' }
      }
    }

    const salt = crypto.randomBytes(32)
    const hash = hashPassword(newPassword, salt)
    const encrypted = encryptContent(plaintext, newPassword, salt)

    db.prepare('UPDATE notes SET content = ?, password_hash = ?, password_salt = ? WHERE id = ?')
      .run(encrypted, hash, salt.toString('hex'), id)
    // Clear FTS content — encrypted notes are not full-text searchable
    db.prepare('INSERT OR REPLACE INTO notes_fts(id, title, content) VALUES (?, (SELECT title FROM notes WHERE id = ?), ?)')
      .run(id, id, '')

    sessionPasswords.set(id, newPassword)
    return { success: true }
  })

  // Remove password — verifies, decrypts, and saves plaintext back to DB
  ipcMain.handle('notes:removePassword', (_, id: string, password: string) => {
    const db = getDb()
    const note = db.prepare('SELECT title, content, password_hash, password_salt FROM notes WHERE id = ?').get(id) as {
      title: string; content: string; password_hash: string | null; password_salt: string | null
    } | undefined
    if (!note?.password_hash) return { success: false, error: 'Note has no password' }

    if (!verifyPassword(password, note.password_salt!, note.password_hash)) {
      return { success: false, error: 'Incorrect password' }
    }

    try {
      const plaintext = decryptContent(note.content, password, Buffer.from(note.password_salt!, 'hex'))
      db.prepare('UPDATE notes SET content = ?, password_hash = NULL, password_salt = NULL WHERE id = ?')
        .run(plaintext, id)
      // Restore FTS content
      db.prepare('INSERT OR REPLACE INTO notes_fts(id, title, content) VALUES (?, ?, ?)').run(id, note.title, plaintext)
      sessionPasswords.delete(id)
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to decrypt note' }
    }
  })

  // Get note versions
  ipcMain.handle('notes:getVersions', (_, noteId: string) => {
    const db = getDb()
    return db
      .prepare('SELECT * FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 15')
      .all(noteId)
  })

  // Search notes (password-protected notes match on title only)
  ipcMain.handle('notes:search', (_, query: string) => {
    const db = getDb()
    return db
      .prepare(`
        SELECT n.*, snippet(notes_fts, 2, '<mark>', '</mark>', '...', 20) as snippet
        FROM notes_fts
        JOIN notes n ON notes_fts.id = n.id
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT 20
      `)
      .all(`${query}*`)
  })

  // Get all embedded images across all notes (skip encrypted content)
  ipcMain.handle('notes:getImages', () => {
    const db = getDb()
    const notes = db
      .prepare('SELECT id, title, updated_at, content FROM notes WHERE content IS NOT NULL AND password_hash IS NULL')
      .all() as { id: string; title: string; updated_at: number; content: string }[]

    const images: { noteId: string; noteTitle: string; noteUpdatedAt: number; src: string; index: number }[] = []

    for (const note of notes) {
      try {
        const doc = JSON.parse(note.content)
        type TipTapNode = { type?: string; attrs?: Record<string, unknown>; content?: TipTapNode[] }
        let index = 0
        const walk = (node: TipTapNode): void => {
          if (node.type === 'image' && node.attrs?.src) {
            images.push({
              noteId: note.id,
              noteTitle: note.title || 'Untitled',
              noteUpdatedAt: note.updated_at,
              src: node.attrs.src as string,
              index: index++
            })
          }
          if (node.content) node.content.forEach(walk)
        }
        walk(doc)
      } catch { /* skip malformed content */ }
    }

    return images
  })
}

// ─── Shared helper ────────────────────────────────────────────────────────────

import type Database from 'better-sqlite3'

function _saveVersion(db: Database.Database, noteId: string, currentContent: string, now: number): void {
  // Never snapshot empty or uninitialized content — these are not meaningful versions
  if (!currentContent || currentContent === '{}') return

  const lastVersion = db
    .prepare('SELECT created_at, content FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(noteId) as { created_at: number; content: string } | undefined

  // Don't snapshot if content hasn't changed since the last version
  if (lastVersion && lastVersion.content === currentContent) return

  const fiveMinutes = 5 * 60 * 1000
  if (!lastVersion || now - lastVersion.created_at > fiveMinutes) {
    db.prepare('INSERT INTO note_versions (id, note_id, content, created_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), noteId, currentContent, now)

    const versions = db
      .prepare('SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC')
      .all(noteId) as { id: string }[]
    if (versions.length > 15) {
      const toDelete = versions.slice(15).map((v) => v.id)
      db.prepare(`DELETE FROM note_versions WHERE id IN (${toDelete.map(() => '?').join(',')})`)
        .run(...toDelete)
    }
  }
}
