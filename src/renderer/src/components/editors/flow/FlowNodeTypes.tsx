import React from 'react'
import { Handle, Position, NodeProps, NodeTypes } from 'reactflow'

const baseNodeStyle = {
  fontSize: 13,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

// All handles are type="source" — combined with connectionMode="loose" on the
// ReactFlow instance this allows connections from/to any handle in any direction.
const handleClass = '!bg-[#e8b800] !border-0 !w-2 !h-2'

function AllHandles(): React.JSX.Element {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="top"    className={handleClass} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleClass} />
      <Handle type="source" position={Position.Left}   id="left"   className={handleClass} />
      <Handle type="source" position={Position.Right}  id="right"  className={handleClass} />
    </>
  )
}

export function RectNode({ data, selected }: NodeProps): React.JSX.Element {
  return (
    <div
      style={baseNodeStyle}
      className={`px-4 py-2.5 rounded-lg border min-w-[100px] text-center text-th-tx-1 bg-th-bg-5 transition-all ${selected ? 'border-[#e8b800] shadow-[0_0_0_1px_#e8b800]' : 'border-th-bd-3'}`}
    >
      <AllHandles />
      {data.label || 'Node'}
    </div>
  )
}

export function CircleNode({ data, selected }: NodeProps): React.JSX.Element {
  return (
    <div
      style={baseNodeStyle}
      className={`w-24 h-24 rounded-full border flex items-center justify-center text-center text-th-tx-1 bg-th-bg-5 transition-all text-xs px-2 ${selected ? 'border-[#e8b800] shadow-[0_0_0_1px_#e8b800]' : 'border-th-bd-3'}`}
    >
      <AllHandles />
      <span className="leading-tight">{data.label || 'Node'}</span>
    </div>
  )
}

export function DiamondNode({ data, selected }: NodeProps): React.JSX.Element {
  return (
    <div style={{ ...baseNodeStyle, width: 120, height: 80, position: 'relative' }}>
      <AllHandles />
      <svg width="120" height="80" style={{ position: 'absolute', top: 0, left: 0 }}>
        <polygon
          points="60,4 116,40 60,76 4,40"
          fill="#252525"
          stroke={selected ? '#e8b800' : '#444'}
          strokeWidth={selected ? 2 : 1}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs text-th-tx-1 text-center px-4">
        {data.label || 'Decision'}
      </div>
    </div>
  )
}

export function TextNode({ data, selected }: NodeProps): React.JSX.Element {
  return (
    <div
      style={baseNodeStyle}
      className={`px-3 py-1 min-w-[80px] text-center text-th-tx-3 border-b transition-all ${selected ? 'border-[#e8b800]' : 'border-transparent'}`}
    >
      <Handle type="source" position={Position.Top}    id="top"    className={`${handleClass} !opacity-0 hover:!opacity-100`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`${handleClass} !opacity-0 hover:!opacity-100`} />
      <Handle type="source" position={Position.Left}   id="left"   className={`${handleClass} !opacity-0 hover:!opacity-100`} />
      <Handle type="source" position={Position.Right}  id="right"  className={`${handleClass} !opacity-0 hover:!opacity-100`} />
      {data.label || 'Label'}
    </div>
  )
}

export const nodeTypes: NodeTypes = {
  rect: RectNode,
  circle: CircleNode,
  diamond: DiamondNode,
  text: TextNode,
}
