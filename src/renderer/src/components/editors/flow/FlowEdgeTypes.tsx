import React, { useCallback, useRef } from 'react'
import { EdgeProps, BaseEdge, EdgeLabelRenderer, useReactFlow, getBezierPath } from 'reactflow'

/**
 * Custom edge that starts as a ReactFlow S-curve bezier.
 * Once the user drags the midpoint handle it switches to a quadratic bezier
 * with a stored control point (data.cpX / data.cpY).
 * Double-click the handle to reset back to the auto S-curve.
 */
export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}: EdgeProps): React.JSX.Element {
  const { setEdges, getViewport } = useReactFlow()

  const storedCpX = data?.cpX as number | undefined
  const storedCpY = data?.cpY as number | undefined
  const hasCp = storedCpX !== undefined

  // Default S-curve bezier path (ReactFlow auto-routing)
  const [bezierPath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  // Once user has dragged, switch to the stored quadratic bezier
  const edgePath = hasCp
    ? `M ${sourceX} ${sourceY} Q ${storedCpX} ${storedCpY} ${targetX} ${targetY}`
    : bezierPath

  // Drag handle sits at the visual midpoint
  const handleX = hasCp ? 0.25 * sourceX + 0.5 * storedCpX! + 0.25 * targetX : labelX
  const handleY = hasCp ? 0.25 * sourceY + 0.5 * storedCpY! + 0.25 * targetY : labelY

  const dragging = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, cpX: 0, cpY: 0 })

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      dragging.current = true
      const { zoom } = getViewport()

      // If no control point yet, derive one from the bezier midpoint so the
      // curve shape roughly matches what the user sees before they start dragging.
      const initCpX = hasCp ? storedCpX! : 2 * labelX - 0.5 * (sourceX + targetX)
      const initCpY = hasCp ? storedCpY! : 2 * labelY - 0.5 * (sourceY + targetY)

      dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, cpX: initCpX, cpY: initCpY }

      // Immediately stamp the control point so the edge switches to quadratic
      if (!hasCp) {
        setEdges((eds) =>
          eds.map((edge) =>
            edge.id === id
              ? { ...edge, data: { ...edge.data, cpX: initCpX, cpY: initCpY } }
              : edge
          )
        )
      }

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
    [id, storedCpX, storedCpY, hasCp, labelX, labelY, sourceX, sourceY, targetX, targetY, getViewport, setEdges]
  )

  const onHandleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Remove stored control point — edge snaps back to auto S-curve
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
