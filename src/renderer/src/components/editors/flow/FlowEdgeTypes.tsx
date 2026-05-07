import React, { useCallback, useRef } from 'react'
import { EdgeProps, BaseEdge, EdgeLabelRenderer, useReactFlow } from 'reactflow'

/**
 * Custom bezier edge with a draggable midpoint control handle.
 * - Drag the dot to bend the edge
 * - Double-click the dot to reset it straight
 * Control point is stored in edge.data.cpX / edge.data.cpY
 */
export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
  selected,
}: EdgeProps): React.JSX.Element {
  const { setEdges, getViewport } = useReactFlow()

  // Control point — defaults to midpoint when not yet dragged
  const cpX = data?.cpX ?? (sourceX + targetX) / 2
  const cpY = data?.cpY ?? (sourceY + targetY) / 2

  // Quadratic bezier path
  const edgePath = `M ${sourceX} ${sourceY} Q ${cpX} ${cpY} ${targetX} ${targetY}`

  // Point on quadratic bezier at t=0.5: 0.25*P0 + 0.5*P1 + 0.25*P2
  const handleX = 0.25 * sourceX + 0.5 * cpX + 0.25 * targetX
  const handleY = 0.25 * sourceY + 0.5 * cpY + 0.25 * targetY

  const dragging = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, cpX: 0, cpY: 0 })

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      dragging.current = true
      const { zoom } = getViewport()
      dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, cpX, cpY }

      const onMouseMove = (ev: MouseEvent): void => {
        if (!dragging.current) return
        const dx = (ev.clientX - dragStart.current.mouseX) / zoom
        const dy = (ev.clientY - dragStart.current.mouseY) / zoom
        setEdges((eds) =>
          eds.map((edge) =>
            edge.id === id
              ? {
                  ...edge,
                  data: {
                    ...edge.data,
                    cpX: dragStart.current.cpX + dx,
                    cpY: dragStart.current.cpY + dy,
                  },
                }
              : edge
          )
        )
      }

      const onMouseUp = (): void => {
        dragging.current = false
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [id, cpX, cpY, getViewport, setEdges]
  )

  const onHandleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Remove stored control point so it snaps back to the default midpoint
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === id
            ? { ...edge, data: { ...edge.data, cpX: undefined, cpY: undefined } }
            : edge
        )
      )
    },
    [id, setEdges]
  )

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${handleX}px,${handleY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div
            onMouseDown={onHandleMouseDown}
            onDoubleClick={onHandleDoubleClick}
            title="Drag to bend · Double-click to reset"
            className={`w-3 h-3 rounded-full border cursor-grab transition-all ${
              selected
                ? 'bg-[#666] border-[#aaa] opacity-100'
                : 'bg-[#444] border-[#777] opacity-0 hover:opacity-100'
            }`}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const edgeTypes = {
  custom: CustomEdge,
}
