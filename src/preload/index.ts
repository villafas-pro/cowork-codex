import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed API to the renderer via window.api
const api = {
  // Notes
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    create: (data: object) => ipcRenderer.invoke('notes:create', data),
    update: (id: string, data: object) => ipcRenderer.invoke('notes:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    togglePin: (id: string) => ipcRenderer.invoke('notes:togglePin', id),
    getVersions: (noteId: string) => ipcRenderer.invoke('notes:getVersions', noteId),
    search: (query: string) => ipcRenderer.invoke('notes:search', query),
    getImages: () => ipcRenderer.invoke('notes:getImages')
  },

  // Work Items
  workItems: {
    getAll: () => ipcRenderer.invoke('workItems:getAll'),
    getForEntity: (entityType: string, entityId: string) =>
      ipcRenderer.invoke('workItems:getForEntity', entityType, entityId),
    create: (url: string, entityType?: string, entityId?: string) =>
      ipcRenderer.invoke('workItems:create', url, entityType, entityId),
    link: (workItemId: string, entityType: string, entityId: string) =>
      ipcRenderer.invoke('workItems:link', workItemId, entityType, entityId),
    unlink: (workItemId: string, entityType: string, entityId: string) =>
      ipcRenderer.invoke('workItems:unlink', workItemId, entityType, entityId),
    toggleDone: (id: string) => ipcRenderer.invoke('workItems:toggleDone', id),
    delete: (id: string) => ipcRenderer.invoke('workItems:delete', id),
    getLinks: (id: string) => ipcRenderer.invoke('workItems:getLinks', id),
    getLinkedEntities: (itemNumber: string) => ipcRenderer.invoke('workItems:getLinkedEntities', itemNumber),
    findByItemNumber: (itemNumber: string) => ipcRenderer.invoke('workItems:findByItemNumber', itemNumber)
  },

  // Code Blocks
  code: {
    getAll: () => ipcRenderer.invoke('code:getAll'),
    get: (id: string) => ipcRenderer.invoke('code:get', id),
    getForNote: (noteId: string) => ipcRenderer.invoke('code:getForNote', noteId),
    create: (data: object) => ipcRenderer.invoke('code:create', data),
    update: (id: string, data: object) => ipcRenderer.invoke('code:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('code:delete', id),
    togglePin: (id: string) => ipcRenderer.invoke('code:togglePin', id),
    syncBlocks: (sourceId: string, targetId: string) =>
      ipcRenderer.invoke('code:syncBlocks', sourceId, targetId),
    import: (sourceId: string, targetNoteId: string, mode: 'copy' | 'sync') =>
      ipcRenderer.invoke('code:import', sourceId, targetNoteId, mode),
    getSyncLocations: (syncGroupId: string) =>
      ipcRenderer.invoke('code:getSyncLocations', syncGroupId)
  },

  // Flows
  flows: {
    getAll: () => ipcRenderer.invoke('flows:getAll'),
    get: (id: string) => ipcRenderer.invoke('flows:get', id),
    create: (data: object) => ipcRenderer.invoke('flows:create', data),
    update: (id: string, data: object) => ipcRenderer.invoke('flows:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('flows:delete', id),
    togglePin: (id: string) => ipcRenderer.invoke('flows:togglePin', id)
  },

  // App / Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },

  // Tabs
  tabs: {
    getAll: () => ipcRenderer.invoke('tabs:getAll'),
    save: (tabs: object[]) => ipcRenderer.invoke('tabs:save', tabs)
  },

  // Todo
  todo: {
    get: () => ipcRenderer.invoke('todo:get'),
    save: (content: string) => ipcRenderer.invoke('todo:save', content)
  },

  // Search
  search: {
    global: (query: string) => ipcRenderer.invoke('search:global', query)
  },

  // Templates
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    create: (name: string, contentJson: string) =>
      ipcRenderer.invoke('templates:create', name, contentJson),
    delete: (id: string) => ipcRenderer.invoke('templates:delete', id)
  },

  // Azure DevOps
  ado: {
    getConfig: () => ipcRenderer.invoke('ado:getConfig'),
    setConfig: (config: object) => ipcRenderer.invoke('ado:setConfig', config),
    testConnection: () => ipcRenderer.invoke('ado:testConnection'),
    search: (filters: object) => ipcRenderer.invoke('ado:search', filters),
    isConfigured: () => ipcRenderer.invoke('ado:isConfigured'),
    fetchWorkItem: (adoId: number, force?: boolean) => ipcRenderer.invoke('ado:fetchWorkItem', adoId, force),
    syncLinkedWorkItems: () => ipcRenderer.invoke('ado:syncLinkedWorkItems')
  },

  // Window controls (for custom title bar)
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
