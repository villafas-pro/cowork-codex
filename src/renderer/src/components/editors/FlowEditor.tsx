import React, { useEffect, useState, useCallback, useRef } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  Connection,
  Edge,
  Node,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Plus, Trash2, Pin, Square, Circle, Diamond,
  Type, Link2, Clipboard, CheckSquare, X, ExternalLink, Minus, AlertTriangle, FileText
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import WorkItemSearch from '../WorkItemSearch'
import { type WorkItem, TYPE_COLORS, DONE_STATES } from '../../lib/workItemUtils'
import { nodeTypes } from './flow/FlowNodeTypes'

// ─── Main Editor ─────────────────────────────────────────────────────────────

function FlowEditorInner({ flowId }: { flowId: string }): React.JSX.Element {
  const { updateTabTitle, closeTab, tabs, setActiveSection, openTab, adoStatus } = useAppStore()
  const [title, setTitle] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [adoConfigured, setAdoConfigured] = useState(false)
  const [linkedNote, setLinkedNote] = useState<{ id: string; title: string } | null>(null)
  const [selectedNodeType, setSelectedNodeType] = useState<'rect' | 'circle' | 'diamond' | 'text'>('rect')
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const titleRef = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Load flow
  useEffect(() => {
    loadFlow()
    loadWorkItems()
    window.api?.ado.isConfigured().then(setAdoConfigured)
  }, [flowId])

  async function loadFlow(): Promise<void> {
    const flow = await window.api?.flows.get(flowId)
    if (!flow) return
    const t = flow.title || ''
    setTitle(t)
    titleRef.current = t
    setIsPinned(!!flow.is_pinned)
    updateTabTitle(flowId, t || 'Untitled')
    if (flow.note_id) {
      const note = await window.api?.notes.get(flow.note_id)
      setLinkedNote(note ? { id: note.id, title: note.title || 'Untitled' } : null)
    } else {
      setLinkedNote(null)
    }

    if (flow.content_json && flow.content_json !== '{}') {
      try {
        const parsed = JSON.parse(flow.content_json)
        setNodes(parsed.nodes || [])
        setEdges(parsed.edges || [])
      } catch { /* ignore */ }
    }
  }

  async function loadWorkItems(): Promise<void> {
    const items = await window.api?.workItems.getForEntity('flow', flowId)
    setWorkItems(items || [])
  }

  // Auto-save
  const scheduleSave = useCallback((currentTitle: string, currentNodes: Node[], currentEdges: Edge[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.api?.flows.update(flowId, {
        title: currentTitle,
        contentJson: JSON.stringify({ nodes: currentNodes, edges: currentEdges })
      })
    }, 500)
  }, [flowId])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const newEdges = addEdge({
        ...params,
        style: { stroke: '#555', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as any, color: '#555' }
      }, eds)
      scheduleSave(titleRef.current, nodes, newEdges)
      return newEdges
    })
  }, [nodes, scheduleSave])

  // Save on node/edge changes (debounced)
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
    // save after state settles
    setTimeout(() => {
      setNodes((nds) => {
        scheduleSave(titleRef.current, nds, edges)
        return nds
      })
    }, 50)
  }, [onNodesChange, edges, scheduleSave])

  const handleEdgesChange = useCallback((changes: any) => {
    onEdgesChange(changes)
    setTimeout(() => {
      setEdges((eds) => {
        scheduleSave(titleRef.current, nodes, eds)
        return eds
      })
    }, 50)
  }, [onEdgesChange, nodes, scheduleSave])

  const addNode = useCallback(() => {
    const id = `node-${Date.now()}`
    const label = selectedNodeType === 'diamond' ? 'Decision' : selectedNodeType === 'text' ? 'Label' : 'Node'
    const newNode: Node = {
      id,
      type: selectedNodeType,
      position: { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 },
      data: { label }
    }
    setNodes((nds) => {
      const updated = [...nds, newNode]
      scheduleSave(titleRef.current, updated, edges)
      return updated
    })
  }, [selectedNodeType, edges, scheduleSave])

  const deleteSelected = useCallback(() => {
    setNodes((nds) => {
      const kept = nds.filter((n) => !n.selected)
      setEdges((eds) => {
        const keptIds = new Set(kept.map((n) => n.id))
        const keptEdges = eds.filter((e) => !e.selected && keptIds.has(e.source) && keptIds.has(e.target))
        scheduleSave(titleRef.current, kept, keptEdges)
        return keptEdges
      })
      return kept
    })
  }, [scheduleSave])

  const openNodeEdit = useCallback((evt: React.MouseEvent, node: Node) => {
    evt.preventDefault()
    setEditingNodeId(node.id)
    setEditingLabel(node.data.label || '')
  }, [])

  const commitNodeEdit = useCallback(() => {
    if (!editingNodeId) return
    setNodes((nds) => {
      const updated = nds.map((n) =>
        n.id === editingNodeId ? { ...n, data: { ...n.data, label: editingLabel } } : n
      )
      scheduleSave(titleRef.current, updated, edges)
      return updated
    })
    setEditingNodeId(null)
  }, [editingNodeId, editingLabel, edges, scheduleSave])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value
    setTitle(val)
    titleRef.current = val
    updateTabTitle(flowId, val || 'Untitled')
    scheduleSave(val, nodes, edges)
  }

  const togglePin = async (): Promise<void> => {
    await window.api?.flows.togglePin(flowId)
    setIsPinned((p) => !p)
  }

  const deleteFlow = async (): Promise<void> => {
    if (!window.confirm(`Delete "${titleRef.current || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.flows.delete(flowId)
    const tab = tabs.find((t) => t.entityType === 'flow' && t.entityId === flowId)
    if (tab) closeTab(tab.id)
    setActiveSection('flow')
  }

  const unlinkNote = async (): Promise<void> => {
    await window.api?.flows.unlinkNote(flowId)
    setLinkedNote(null)
  }

  // Work item actions
  const addWorkItem = async (url?: string): Promise<void> => {
    const target = url || newItemUrl.trim()
    if (!target) return
    const item = await window.api?.workItems.create(target, 'flow', flowId)
    if (item) {
      setNewItemUrl('')
      setShowAddItem(false)
      if (target.includes('dev.azure.com')) {
        await window.api?.ado.fetchWorkItem(parseInt(item.item_number, 10)).catch(() => {})
      }
      await loadWorkItems()
    }
  }

  const pasteWorkItem = async (): Promise<void> => {
    const text = await navigator.clipboard.readText()
    if (text.trim()) await addWorkItem(text.trim())
  }

  const toggleWorkItem = async (id: string): Promise<void> => {
    await window.api?.workItems.toggleDone(id)
    setWorkItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_done: i.is_done ? 0 : 1 } : i)))
  }

  const removeWorkItem = async (workItemId: string): Promise<void> => {
    await window.api?.workItems.unlink(workItemId, 'flow', flowId)
    setWorkItems((prev) => prev.filter((i) => i.id !== workItemId))
  }

  const effectiveDone = (i: WorkItem): boolean =>
    i.is_ado && i.cached_state ? DONE_STATES.has(i.cached_state) : !!i.is_done
  const allDone = workItems.length > 0 && workItems.every(effectiveDone)

  const nodeTypeButtons: { type: 'rect' | 'circle' | 'diamond' | 'text'; icon: React.ReactNode; label: string }[] = [
    { type: 'rect', icon: <Square size={12} />, label: 'Box' },
    { type: 'circle', icon: <Circle size={12} />, label: 'Circle' },
    { type: 'diamond', icon: <Diamond size={12} />, label: 'Diamond' },
    { type: 'text', icon: <Type size={12} />, label: 'Text' },
  ]

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main canvas area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-th-bd-1 bg-th-bg-1 flex-shrink-0">
          {/* Node type selector */}
          <div className="flex items-center gap-0.5 bg-th-bg-3 border border-th-bd-2 rounded-md p-0.5">
            {nodeTypeButtons.map((b) => (
              <button
                key={b.type}
                onClick={() => setSelectedNodeType(b.type)}
                title={b.label}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all ${selectedNodeType === b.type ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-4 hover:text-th-tx-2'}`}
              >
                {b.icon}
                <span className="text-[11px]">{b.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={addNode}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-black text-xs font-medium transition-all"
          >
            <Plus size={12} />
            Add Node
          </button>

          <button
            onClick={deleteSelected}
            title="Delete selected (Del)"
            className="p-1.5 rounded text-th-tx-5 hover:text-red-400 hover:bg-th-danger transition-all"
          >
            <Minus size={13} />
          </button>

          <div className="flex-1" />

          <button onClick={togglePin} className={`p-1.5 rounded transition-all ${isPinned ? 'text-accent' : 'text-th-tx-5 hover:text-th-tx-2'}`} title={isPinned ? 'Unpin' : 'Pin'}>
            <Pin size={13} />
          </button>
          <button onClick={deleteFlow} className="p-1.5 rounded transition-all text-th-tx-5 hover:text-red-400 hover:bg-th-danger" title="Delete flow">
            <Trash2 size={13} />
          </button>
        </div>

        {/* Title */}
        <div className="px-6 pt-4 pb-2 flex-shrink-0 border-b border-th-bd-1">
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled Flow"
            className="w-full bg-transparent text-2xl text-th-tx-1 placeholder-th-tx-5 outline-none caret-accent"
          />
        </div>

        {/* React Flow canvas */}
        <div ref={reactFlowWrapper} className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={openNodeEdit}
            nodeTypes={nodeTypes}
            deleteKeyCode="Delete"
            fitView
            fitViewOptions={{ padding: 0.2 }}
            style={{ background: '#181818' }}
            defaultEdgeOptions={{
              style: { stroke: '#555', strokeWidth: 1.5 },
              markerEnd: { type: 'arrowclosed' as any, color: '#555' }
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#2a2a2a"
            />
            <Controls
              style={{ background: '#202020', border: '1px solid #383838', borderRadius: 8 }}
              showInteractive={false}
            />
            <MiniMap
              style={{ background: '#141414', border: '1px solid #333' }}
              nodeColor="#383838"
              maskColor="rgba(0,0,0,0.5)"
            />

            {/* Hint panel */}
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-8 text-th-tx-6 text-xs text-center select-none pointer-events-none">
                  <p>Click "Add Node" to start building your flow</p>
                  <p className="mt-1">Drag from a node handle to connect • Double-click to rename • Delete key removes selected</p>
                </div>
              </Panel>
            )}
          </ReactFlow>

          {/* Node label editor modal */}
          {editingNodeId && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/40">
              <div className="bg-th-bg-4 border border-th-bd-3 rounded-xl p-4 w-72 shadow-2xl">
                <p className="text-xs text-th-tx-4 mb-2">Edit label</p>
                <input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNodeEdit()
                    if (e.key === 'Escape') setEditingNodeId(null)
                  }}
                  autoFocus
                  className="w-full bg-th-bg-3 border border-th-bd-3 rounded-lg px-3 py-2 text-sm text-th-tx-1 outline-none focus:border-accent caret-accent"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => setEditingNodeId(null)} className="px-3 py-1.5 text-xs text-th-tx-4 hover:text-th-tx-1 transition-colors">Cancel</button>
                  <button onClick={commitNodeEdit} className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-black font-medium rounded-md transition-all">Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Work items panel */}
      <div className={`w-60 flex-shrink-0 border-l border-th-bd-1 bg-th-bg-1 flex flex-col transition-opacity ${allDone ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-th-bd-1">
          <div className="flex items-center gap-1.5">
            <Link2 size={12} className="text-th-tx-5" />
            <span className="text-xs text-th-tx-4 font-medium uppercase tracking-wide">Work Items</span>
            {allDone && <span className="text-xs text-accent ml-1">✓ Done</span>}
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={pasteWorkItem} title="Paste from clipboard" className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all">
              <Clipboard size={12} />
            </button>
            {!adoConfigured && (
              <button
                onClick={() => setShowAddItem(!showAddItem)}
                className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>

        {adoConfigured && (
          <div className="px-3 py-2 border-b border-th-bd-1">
            <WorkItemSearch
              onAdd={(url) => { addWorkItem(url) }}
            />
          </div>
        )}

        {showAddItem && !adoConfigured && (
          <div className="px-3 py-2 border-b border-th-bd-1">
            <input
              value={newItemUrl}
              onChange={(e) => setNewItemUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWorkItem()}
              placeholder="Paste Azure DevOps URL..."
              autoFocus
              className="w-full bg-th-bg-3 border border-th-bd-2 rounded px-2 py-1.5 text-xs text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {workItems.length === 0 ? (
            <p className="text-xs text-th-tx-6 text-center py-6">No linked work items</p>
          ) : (
            workItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 px-3 py-2 group hover:bg-th-bg-3 transition-all">
                {item.is_ado ? (
                  <span className="flex-shrink-0 text-th-tx-6 mt-0.5 cursor-default" title="State managed by ADO">
                    {effectiveDone(item) ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                  </span>
                ) : (
                  <button onClick={() => toggleWorkItem(item.id)} className="flex-shrink-0 text-th-tx-6 hover:text-accent transition-colors mt-0.5">
                    {item.is_done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                  </button>
                )}
                <button
                  onClick={() => openTab({ entityType: 'work-item', entityId: item.item_number, title: item.cached_title || `#${item.item_number}` })}
                  className={`flex-1 text-left min-w-0 transition-all hover:text-accent ${effectiveDone(item) ? 'opacity-40' : ''}`}
                >
                  {item.cached_title ? (
                    <>
                      <p className="text-xs text-th-tx-2 truncate leading-snug">{item.cached_title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.cached_type && (
                          <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: TYPE_COLORS[item.cached_type] || '#666' }} />
                        )}
                        <span className="text-[10px] text-th-tx-6">#{item.item_number}</span>
                        {item.cached_state && <span className="text-[10px] text-th-tx-6">· {item.cached_state}</span>}
                      </div>
                    </>
                  ) : (
                    <p className={`text-xs truncate ${item.is_done ? 'line-through text-th-tx-6' : 'text-th-tx-2'}`}>#{item.item_number}</p>
                  )}
                </button>
                <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                  {item.is_ado && adoStatus === 'error' && (
                    <span title="ADO connection error — data may be stale" className="text-amber-500 p-0.5">
                      <AlertTriangle size={11} />
                    </span>
                  )}
                  <button onClick={() => window.api?.shell.openExternal(item.url)} title="Open in ADO" className="text-th-tx-6 group-hover:text-th-tx-5 transition-colors p-0.5">
                    <ExternalLink size={11} />
                  </button>
                  <button onClick={() => removeWorkItem(item.id)} className="text-th-tx-6 group-hover:text-th-tx-5 hover:!text-red-400 transition-colors p-0.5">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Linked in note */}
        {linkedNote && (
          <div className="border-t border-th-bd-1 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-2.5">
              <FileText size={12} className="text-th-tx-5" />
              <span className="text-xs text-th-tx-4 font-medium uppercase tracking-wide">Linked in</span>
            </div>
            <div className="flex items-center gap-1 px-2 pb-2 group">
              <button
                onClick={() => openTab({ entityType: 'note', entityId: linkedNote.id, title: linkedNote.title })}
                className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-th-bg-3 transition-all text-left min-w-0"
              >
                <FileText size={12} className="text-th-tx-5 flex-shrink-0" />
                <span className="text-xs text-th-tx-2 truncate hover:text-accent transition-colors">{linkedNote.title}</span>
              </button>
              <button
                onClick={unlinkNote}
                title="Unlink from note"
                className="p-1 rounded text-th-tx-6 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FlowEditor({ flowId }: { flowId: string }): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <FlowEditorInner flowId={flowId} />
    </ReactFlowProvider>
  )
}
