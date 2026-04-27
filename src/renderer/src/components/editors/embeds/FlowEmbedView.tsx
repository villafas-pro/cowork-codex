import React, { useEffect, useState, useCallback, useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { GitBranch, ExternalLink, X, Plus, Square, Circle, Diamond, Type, Minus, GripVertical } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { nodeTypes } from '../flow/FlowNodeTypes'

type NodeShapeType = 'rect' | 'circle' | 'diamond' | 'text'

function FlowEmbedInner({ flowId, onDelete, selected, onGripMouseDown }: {
  flowId: string
  onDelete: () => void
  selected: boolean
  onGripMouseDown: () => void
}): React.JSX.Element {
  const { openTab } = useAppStore()

  const [title, setTitle] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [selectedNodeType, setSelectedNodeType] = useState<NodeShapeType>('rect')
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const titleRef = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const embedFocusedRef = useRef(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Use a ref so the wheel handler always reads the live focused value
  // without needing to re-register on every focus change.
  useEffect(() => {
    const focusHandler = (e: MouseEvent): void => {
      embedFocusedRef.current = !!wrapperRef.current?.contains(e.target as Node)
    }
    document.addEventListener('mousedown', focusHandler, true)

    const wrapper = wrapperRef.current
    const wheelHandler = (e: WheelEvent): void => {
      if (embedFocusedRef.current) return
      e.stopPropagation()
      e.preventDefault()
      let parent = wrapper?.parentElement
      while (parent) {
        const overflow = window.getComputedStyle(parent).overflowY
        if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) {
          parent.scrollTop += e.deltaY
          break
        }
        parent = parent.parentElement
      }
    }
    wrapper?.addEventListener('wheel', wheelHandler, { capture: true, passive: false })

    return () => {
      document.removeEventListener('mousedown', focusHandler, true)
      wrapper?.removeEventListener('wheel', wheelHandler, true)
    }
  }, [])

  useEffect(() => {
    if (!flowId) return
    window.api?.flows.get(flowId).then((flow: any) => {
      if (!flow) return
      const t = flow.title || ''
      setTitle(t)
      titleRef.current = t
      if (flow.content_json && flow.content_json !== '{}') {
        try {
          const parsed = JSON.parse(flow.content_json)
          setNodes(parsed.nodes || [])
          setEdges(parsed.edges || [])
        } catch { /* ignore */ }
      }
      setLoaded(true)
    })
  }, [flowId])

  const scheduleSave = useCallback((currentTitle: string, currentNodes: Node[], currentEdges: Edge[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api?.flows.update(flowId, {
        title: currentTitle,
        contentJson: JSON.stringify({ nodes: currentNodes, edges: currentEdges }),
      })
    }, 500)
  }, [flowId])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value
    setTitle(val)
    titleRef.current = val
    scheduleSave(val, nodes, edges)
  }

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const newEdges = addEdge({
        ...params,
        style: { stroke: '#555', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as any, color: '#555' },
      }, eds)
      scheduleSave(titleRef.current, nodes, newEdges)
      return newEdges
    })
  }, [nodes, scheduleSave])

  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
    setTimeout(() => {
      setNodes((nds) => { scheduleSave(titleRef.current, nds, edges); return nds })
    }, 50)
  }, [onNodesChange, edges, scheduleSave])

  const handleEdgesChange = useCallback((changes: any) => {
    onEdgesChange(changes)
    setTimeout(() => {
      setEdges((eds) => { scheduleSave(titleRef.current, nodes, eds); return eds })
    }, 50)
  }, [onEdgesChange, nodes, scheduleSave])

  const addNode = useCallback(() => {
    const id = `node-${Date.now()}`
    const label = selectedNodeType === 'diamond' ? 'Decision' : selectedNodeType === 'text' ? 'Label' : 'Node'
    const newNode: Node = {
      id,
      type: selectedNodeType,
      position: { x: 150 + Math.random() * 80, y: 80 + Math.random() * 80 },
      data: { label },
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

  const openFull = (): void => {
    openTab({ entityType: 'flow', entityId: flowId, title: title || 'Untitled' })
  }

  const remove = async (): Promise<void> => {
    await window.api?.flows.unlinkNote(flowId)
    onDelete()
  }

  const nodeTypeButtons: { type: NodeShapeType; icon: React.ReactNode; label: string }[] = [
    { type: 'rect',    icon: <Square size={11} />,   label: 'Box' },
    { type: 'circle',  icon: <Circle size={11} />,   label: 'Circle' },
    { type: 'diamond', icon: <Diamond size={11} />,  label: 'Diamond' },
    { type: 'text',    icon: <Type size={11} />,     label: 'Text' },
  ]

  return (
    <div
      ref={wrapperRef}
      className={`my-3 rounded-lg border overflow-hidden transition-all ${selected ? 'border-accent shadow-[0_0_0_1px_#e8b800]' : 'border-th-bd-2'}`}
      contentEditable={false}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-th-bg-2 border-b border-th-bd-1 select-none">
        <GripVertical
          size={12}
          className="text-th-tx-6 hover:text-th-tx-4 flex-shrink-0 cursor-grab active:cursor-grabbing"
          onMouseDown={onGripMouseDown}
        />
        <GitBranch size={12} className="text-th-tx-5 flex-shrink-0" />
        <input
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled Flow"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent text-xs text-th-tx-1 placeholder-th-tx-5 outline-none caret-accent min-w-0"
        />
        <button
          onClick={openFull}
          title="Open in full page"
          className="p-1 rounded text-th-tx-5 hover:text-th-tx-2 transition-all flex-shrink-0"
        >
          <ExternalLink size={12} />
        </button>
        <button
          onClick={remove}
          title="Remove from note"
          className="p-1 rounded text-th-tx-5 hover:text-red-400 transition-all flex-shrink-0"
        >
          <X size={12} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-th-bg-2 border-b border-th-bd-1">
        <div className="flex items-center gap-0.5 bg-th-bg-3 border border-th-bd-2 rounded-md p-0.5">
          {nodeTypeButtons.map((b) => (
            <button
              key={b.type}
              onClick={() => setSelectedNodeType(b.type)}
              title={b.label}
              className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5 transition-all ${selectedNodeType === b.type ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-4 hover:text-th-tx-2'}`}
            >
              {b.icon}
            </button>
          ))}
        </div>
        <button
          onClick={addNode}
          className="flex items-center gap-1 px-2 py-1 rounded bg-accent hover:bg-accent-hover text-black text-[10px] font-medium transition-all"
        >
          <Plus size={10} />
          Add
        </button>
        <button
          onClick={deleteSelected}
          title="Delete selected"
          className="p-1 rounded text-th-tx-5 hover:text-red-400 hover:bg-th-danger transition-all"
        >
          <Minus size={11} />
        </button>
      </div>

      {/* Canvas */}
      {loaded ? (
        <div style={{ height: 300, position: 'relative' }} onDragStart={(e) => e.stopPropagation()}>
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
            fitViewOptions={{ padding: 0.3 }}
            style={{ background: '#181818' }}
            defaultEdgeOptions={{
              style: { stroke: '#555', strokeWidth: 1.5 },
              markerEnd: { type: 'arrowclosed' as any, color: '#555' },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2a2a" />
            <Controls
              style={{ background: '#202020', border: '1px solid #383838', borderRadius: 8 }}
              showInteractive={false}
            />
          </ReactFlow>

          {/* Node label edit modal */}
          {editingNodeId && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/40">
              <div className="bg-th-bg-4 border border-th-bd-3 rounded-xl p-4 w-64 shadow-2xl">
                <p className="text-xs text-th-tx-4 mb-2">Edit label</p>
                <input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
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
      ) : (
        <div className="h-[300px] flex items-center justify-center" style={{ background: '#181818' }}>
          <span className="text-xs text-th-tx-6">Loading…</span>
        </div>
      )}
    </div>
  )
}

export default function FlowEmbedView({ node, deleteNode, selected, getPos, editor }: NodeViewProps): React.JSX.Element {
  const { flowId } = node.attrs
  const dragFromGrip = useRef(false)

  useEffect(() => {
    const editorDom = editor.view.dom
    const handler = (e: DragEvent): void => {
      const pos = getPos()
      if (pos === undefined) return
      if (e.target !== editor.view.nodeDOM(pos)) return

      if (!dragFromGrip.current) {
        e.preventDefault()
        return
      }
      dragFromGrip.current = false
      if (!e.dataTransfer) return
      e.dataTransfer.clearData()
      e.dataTransfer.setData('application/cowork-embed', JSON.stringify({ pos, nodeSize: node.nodeSize }))
      e.dataTransfer.effectAllowed = 'move'
    }
    editorDom.addEventListener('dragstart', handler, true)
    return () => editorDom.removeEventListener('dragstart', handler, true)
  }, [editor, getPos, node.nodeSize])

  return (
    <NodeViewWrapper>
      <ReactFlowProvider>
        <FlowEmbedInner
          flowId={flowId}
          onDelete={deleteNode}
          selected={!!selected}
          onGripMouseDown={() => { dragFromGrip.current = true }}
        />
      </ReactFlowProvider>
    </NodeViewWrapper>
  )
}
