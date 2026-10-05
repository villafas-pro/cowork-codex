import { ipcMain } from 'electron'
import {
  checkAll, deleteConnection, fetchItem, listPublicConnections, parseRef, saveConnection,
  searchAll, syncLinked, testConnection, listConnections, type ConnectionInput, type SearchFilters
} from '../integrations'

// Work item integrations (Azure DevOps, Jira). Tokens never leave the main process.
export function registerIntegrationHandlers(): void {
  ipcMain.handle('integrations:getConnections', () => listPublicConnections())

  ipcMain.handle('integrations:saveConnection', (_, input: ConnectionInput) => saveConnection(input))

  ipcMain.handle('integrations:deleteConnection', (_, id: string) => {
    deleteConnection(id)
    return { success: true }
  })

  ipcMain.handle('integrations:testConnection', (_, id: string) => testConnection(id))

  ipcMain.handle('integrations:isConfigured', () => listConnections().length > 0)

  // Used for the sidebar warning dot: tests every connection
  ipcMain.handle('integrations:checkAll', () => checkAll())

  ipcMain.handle('integrations:search', (_, filters: SearchFilters) => searchAll(filters))

  ipcMain.handle('integrations:fetchItem', (_, itemNumber: string, force?: boolean) =>
    fetchItem(String(itemNumber), !!force)
  )

  ipcMain.handle('integrations:syncLinked', () => syncLinked())

  // Recognize a pasted URL or key. Returns { provider, itemNumber, container, url } or null.
  ipcMain.handle('integrations:parseRef', (_, ref: string) => parseRef(ref))
}
