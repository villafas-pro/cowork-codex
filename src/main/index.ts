import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, backupDb, closeDb } from './db'
import { registerNoteHandlers } from './ipc/notes'
import { registerWorkItemHandlers } from './ipc/workItems'
import { registerCodeBlockHandlers } from './ipc/codeBlocks'
import { registerFlowHandlers } from './ipc/flows'
import { registerAppHandlers } from './ipc/app'
import { registerAdoHandlers } from './ipc/ado'

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.coworkcodex')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDb()

  // Auto-backup on startup
  backupDb()

  // Register IPC handlers
  registerNoteHandlers()
  registerWorkItemHandlers()
  registerCodeBlockHandlers()
  registerFlowHandlers()
  registerAppHandlers()
  registerAdoHandlers()

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
