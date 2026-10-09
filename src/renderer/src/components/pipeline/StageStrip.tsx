import React from 'react'
import { ChevronRight } from 'lucide-react'
import { STAGE_META, STAGE_ORDER, type Stage } from '../../lib/pipelineUi'

/**
 * The pipeline at a glance: one tile per stage with a big count. Click a tile to filter the
 * board to that stage, click again to clear.
 */
export default function StageStrip({
  counts,
  active,
  onToggle
}: {
  counts: Record<Stage, number>
  active: Stage | null
  onToggle: (stage: Stage) => void
}): React.JSX.Element {
  return (
    <div className="flex items-stretch gap-1 px-4 pb-3">
      {STAGE_ORDER.map((stage, i) => {
        const meta = STAGE_META[stage]
        const n = counts[stage] ?? 0
        const isActive = active === stage
        return (
          <React.Fragment key={stage}>
            <button
              onClick={() => onToggle(stage)}
              title={`${meta.hint}${isActive ? ' (click to clear filter)' : ' (click to filter)'}`}
              style={isActive ? { boxShadow: `inset 0 0 0 1.5px ${meta.color}` } : undefined}
              className={`relative flex-1 min-w-0 rounded-lg border border-th-bd-2 bg-th-bg-3 px-3 pt-3 pb-2 text-left overflow-hidden transition-colors hover:bg-th-bg-5 ${
                active && !isActive ? 'opacity-50' : ''
              }`}
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: meta.color, opacity: n > 0 ? 1 : 0.25 }} />
              <span
                className="block text-2xl font-semibold leading-none tabular-nums"
                style={{ color: n > 0 ? meta.color : undefined }}
              >
                <span className={n > 0 ? '' : 'text-th-tx-6'}>{n}</span>
              </span>
              <span className="mt-1.5 block text-[11px] text-th-tx-3 truncate">{meta.label}</span>
            </button>
            {i < STAGE_ORDER.length - 1 && (
              <ChevronRight size={14} className="self-center flex-shrink-0 text-th-tx-6 hidden md:block" />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
