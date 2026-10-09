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
    toggleLock: (id: string) => ipcRenderer.invoke('notes:toggleLock', id),
    unlock: (id: string, password: string) => ipcRenderer.invoke('notes:unlock', id, password),
    setPassword: (id: string, newPassword: string) => ipcRenderer.invoke('notes:setPassword', id, newPassword),
    removePassword: (id: string, password: string) => ipcRenderer.invoke('notes:removePassword', id, password),
    getVersions: (noteId: string) => ipcRenderer.invoke('notes:getVersions', noteId),
    search: (query: string) => ipcRenderer.invoke('notes:search', query),
    getImages: () => ipcRenderer.invoke('notes:getImages')
  },

  // Tags (entityType = 'note' | 'code' | 'flow')
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (name: string, color?: string) => ipcRenderer.invoke('tags:create', name, color),
    update: (id: string, data: { name?: string; color?: string }) =>
      ipcRenderer.invoke('tags:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tags:delete', id),
    merge: (sourceId: string, targetId: string) => ipcRenderer.invoke('tags:merge', sourceId, targetId),
    getAssignments: (entityType?: string) => ipcRenderer.invoke('tags:getAssignments', entityType),
    assign: (entityType: string, entityId: string, tagId: string) =>
      ipcRenderer.invoke('tags:assign', entityType, entityId, tagId),
    unassign: (entityType: string, entityId: string, tagId: string) =>
      ipcRenderer.invoke('tags:unassign', entityType, entityId, tagId),
    getItems: (tagIds: string[], mode: 'and' | 'or', includeArchived: boolean) =>
      ipcRenderer.invoke('tags:getItems', tagIds, mode, includeArchived)
  },

  // Archive
  archive: {
    set: (entityType: string, id: string, archived: boolean) =>
      ipcRenderer.invoke('archive:set', entityType, id, archived),
    archiveCompletedNotes: () => ipcRenderer.invoke('archive:archiveCompletedNotes')
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
      ipcRenderer.invoke('code:getSyncLocations', syncGroupId),
    unlinkNote: (id: string) => ipcRenderer.invoke('code:unlinkNote', id),
    linkNote: (codeId: string, noteId: string) => ipcRenderer.invoke('code:linkNote', codeId, noteId)
  },

  // Flows
  flows: {
    getAll: () => ipcRenderer.invoke('flows:getAll'),
    get: (id: string) => ipcRenderer.invoke('flows:get', id),
    getForNote: (noteId: string) => ipcRenderer.invoke('flows:getForNote', noteId),
    create: (data: object) => ipcRenderer.invoke('flows:create', data),
    update: (id: string, data: object) => ipcRenderer.invoke('flows:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('flows:delete', id),
    togglePin: (id: string) => ipcRenderer.invoke('flows:togglePin', id),
    unlinkNote: (id: string) => ipcRenderer.invoke('flows:unlinkNote', id),
    linkNote: (flowId: string, noteId: string) => ipcRenderer.invoke('flows:linkNote', flowId, noteId)
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
    global: (query: string, includeArchived?: boolean) =>
      ipcRenderer.invoke('search:global', query, includeArchived)
  },

  // Templates
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    create: (name: string, contentJson: string) =>
      ipcRenderer.invoke('templates:create', name, contentJson),
    delete: (id: string) => ipcRenderer.invoke('templates:delete', id)
  },

  // Work item integrations (Azure DevOps, Jira)
  integrations: {
    getConnections: () => ipcRenderer.invoke('integrations:getConnections'),
    saveConnection: (input: object) => ipcRenderer.invoke('integrations:saveConnection', input),
    deleteConnection: (id: string) => ipcRenderer.invoke('integrations:deleteConnection', id),
    testConnection: (id: string) => ipcRenderer.invoke('integrations:testConnection', id),
    isConfigured: () => ipcRenderer.invoke('integrations:isConfigured'),
    checkAll: () => ipcRenderer.invoke('integrations:checkAll'),
    search: (filters: object) => ipcRenderer.invoke('integrations:search', filters),
    fetchItem: (itemNumber: string, force?: boolean) =>
      ipcRenderer.invoke('integrations:fetchItem', itemNumber, force),
    syncLinked: () => ipcRenderer.invoke('integrations:syncLinked'),
    parseRef: (ref: string) => ipcRenderer.invoke('integrations:parseRef', ref)
  },

  // Pipeline dashboard (Claude, Jira, Rivet, GitHub)
  pipeline: {
    getBoard: () => ipcRenderer.invoke('pipeline:getBoard'),
    sync: () => ipcRenderer.invoke('pipeline:sync'),
    add: (ref: string, categoryId?: string) => ipcRenderer.invoke('pipeline:add', ref, categoryId),
    remove: (key: string) => ipcRenderer.invoke('pipeline:remove', key),
    move: (key: string, categoryId: string, index: number) => ipcRenderer.invoke('pipeline:move', key, categoryId, index),
    suggestions: () => ipcRenderer.invoke('pipeline:suggestions'),
    getCategories: () => ipcRenderer.invoke('pipeline:getCategories'),
    createCategory: (name: string, color?: string) => ipcRenderer.invoke('pipeline:createCategory', name, color),
    updateCategory: (id: string, patch: object) => ipcRenderer.invoke('pipeline:updateCategory', id, patch),
    deleteCategory: (id: string) => ipcRenderer.invoke('pipeline:deleteCategory', id),
    reorderCategories: (ids: string[]) => ipcRenderer.invoke('pipeline:reorderCategories', ids),
    // Fires when a background refresh finishes. Returns an unsubscribe function.
    onUpdated: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('pipeline:updated', handler)
      return () => ipcRenderer.removeListener('pipeline:updated', handler)
    }
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
