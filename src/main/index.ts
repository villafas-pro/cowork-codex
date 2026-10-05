import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, backupDb, closeDb } from './db'
import { registerNoteHandlers } from './ipc/notes'
import { registerTagHandlers } from './ipc/tags'
import { registerWorkItemHandlers } from './ipc/workItems'
import { registerCodeBlockHandlers } from './ipc/codeBlocks'
import { registerFlowHandlers } from './ipc/flows'
import { registerAppHandlers } from './ipc/app'
import { registerIntegrationHandlers } from './ipc/integrations'
import { migrateLegacyAdoSettings } from './integrations'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quickCaptureWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Custom title bar
    titleBarStyle: 'hidden',
    backgroundColor: '#141414',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Links inside rendered content (work item descriptions, notes) must open in the browser,
  // never replace the app window.
  const openInBrowser = (url: string): void => {
    try {
      if (['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url)
    } catch { /* ignore */ }
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = is.dev && process.env['ELECTRON_RENDERER_URL'] ? process.env['ELECTRON_RENDERER_URL'] : 'file://'
    if (url.startsWith(appUrl)) return // reload or in-app navigation
    event.preventDefault()
    openInBrowser(url)
  })

  // Safety net: if the renderer fails to load or never signals ready, show the window anyway
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] failed to load', url, code, desc)
    mainWindow?.show()
  })
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  }, 5000)

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault()
    mainWindow?.hide()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createQuickCaptureWindow(): void {
  if (quickCaptureWindow) {
    quickCaptureWindow.focus()
    return
  }

  quickCaptureWindow = new BrowserWindow({
    width: 480,
    height: 300,
    show: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  quickCaptureWindow.on('blur', () => {
    quickCaptureWindow?.hide()
  })

  quickCaptureWindow.on('closed', () => {
    quickCaptureWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    quickCaptureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#quick-capture`)
  } else {
    quickCaptureWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'quick-capture'
    })
  }
}

function createTray(): void {
  const iconPath = is.dev
    ? join(app.getAppPath(), 'resources/icon.ico')
    : join(process.resourcesPath, 'icon.ico')
  const rawIcon = nativeImage.createFromPath(iconPath)
  if (rawIcon.isEmpty()) {
    console.warn('[tray] icon not found at', iconPath)
    return
  }
  const icon = rawIcon.resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Cowork Codex',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'Quick Capture',
      accelerator: 'CmdOrCtrl+Shift+Space',
      click: () => {
        createQuickCaptureWindow()
        quickCaptureWindow?.show()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        closeDb()
        app.exit(0)
      }
    }
  ])

  tray.setToolTip('Cowork Codex')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// Enforce single instance — second launch focuses the existing window and exits.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Closing the window only hides it to the tray, so an older copy may still be running.
  console.error(
    '[startup] Another Cowork Codex instance is already running (check the system tray or Task Manager). Quitting.'
  )
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.coworkcodex')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Initialize database. Surface failures (e.g. better-sqlite3 built for the wrong
    // Electron version, locked DB file) instead of dying silently with no window.
    try {
      initDb()
    } catch (err) {
      console.error('[startup] Database failed to initialize:', err)
      dialog.showErrorBox(
        'Cowork Codex failed to start',
        `The database could not be opened.\n\n${err instanceof Error ? err.message : String(err)}\n\n` +
          'If this mentions NODE_MODULE_VERSION, run: npm run rebuild'
      )
      app.exit(1)
      return
    }

    // Move the old single ADO config (plain-text token) into an encrypted connection
    try {
      migrateLegacyAdoSettings()
    } catch (err) {
      console.error('[startup] Could not migrate ADO settings:', err)
    }

    // Auto-backup on startup (never block launch on a failed backup)
    try {
      backupDb()
    } catch (err) {
      console.error('[startup] Backup failed:', err)
    }

    // Register IPC handlers
    registerNoteHandlers()
    registerTagHandlers()
    registerWorkItemHandlers()
    registerCodeBlockHandlers()
    registerFlowHandlers()
    registerAppHandlers()
    registerIntegrationHandlers()

    createWindow()
    createTray()

    // Window control IPC
    ipcMain.on('window:minimize', () => mainWindow?.minimize())
    ipcMain.on('window:maximize', () => {
      if (mainWindow?.isMaximized()) mainWindow.unmaximize()
      else mainWindow?.maximize()
    })
    ipcMain.on('window:close', () => mainWindow?.hide())

    // Global shortcut for quick capture
    globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
      createQuickCaptureWindow()
      quickCaptureWindow?.show()
      quickCaptureWindow?.focus()
    })
  })

  app.on('window-all-closed', () => {
    // Keep app running in tray
  })

  app.on('before-quit', () => {
    closeDb()
    globalShortcut.unregisterAll()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}
