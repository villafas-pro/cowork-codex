import React, { useCallback, useEffect, useState } from 'react'
import { Archive, ArchiveRestore } from 'lucide-react'
import type { Tag, TaggableType } from '../lib/tags'
import { TagChips, TagPicker } from './TagUI'

/**
 * Tag chips, tag picker and archive toggle for one item. Drop it into an editor toolbar.
 * It loads and saves its own state, so editors only pass the entity type and id.
 */
export default function EntityTagsArchive({
  entityType,
  entityId
}: {
  entityType: TaggableType
  entityId: string
}): React.JSX.Element {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [assigned, setAssigned] = useState<Tag[]>([])
  const [archivedAt, setArchivedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    const api = window.api
    if (!api) return
    const getEntity =
      entityType === 'note' ? api.notes.get : entityType === 'code' ? api.code.get : api.flows.get
    const [tags, rows, entity] = await Promise.all([
      api.tags.getAll(),
      api.tags.getAssignments(entityType),
      getEntity(entityId)
    ])
    const ids = new Set(
      (rows as { tag_id: string; entity_id: string }[])
        .filter((r) => r.entity_id === entityId)
        .map((r) => r.tag_id)
    )
    setAllTags(tags as Tag[])
    setAssigned((tags as Tag[]).filter((t) => ids.has(t.id)))
    setArchivedAt(entity?.archived_at ?? null)
  }, [entityType, entityId])

  useEffect(() => {
    load()
  }, [load])

  async function assign(tag: Tag): Promise<void> {
    await window.api?.tags.assign(entityType, entityId, tag.id)
    setAssigned((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
  }

  async function unassign(tagId: string): Promise<void> {
    await window.api?.tags.unassign(entityType, entityId, tagId)
    setAssigned((prev) => prev.filter((t) => t.id !== tagId))
  }

  async function create(name: string): Promise<void> {
    const tag: Tag | null = await window.api?.tags.create(name)
    if (!tag) return
    setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
    await assign(tag)
  }

  async function toggleArchive(): Promise<void> {
    const res = await window.api?.archive.set(entityType, entityId, !archivedAt)
    setArchivedAt(res?.archivedAt ?? null)
  }

  const sorted = [...assigned].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <TagChips tags={sorted} max={3} />
      <TagPicker
        allTags={allTags}
        assigned={sorted}
        onAssign={assign}
        onUnassign={unassign}
        onCreate={create}
        buttonClassName="p-1.5 rounded transition-all flex-shrink-0 flex items-center text-th-tx-5 hover:text-th-tx-2"
      />
      {archivedAt ? (
        <button
          onClick={toggleArchive}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-th-bd-2 text-[11px] text-th-tx-3 hover:text-accent hover:border-accent transition-colors"
          title="This item is archived. Click to restore."
        >
          <ArchiveRestore size={11} />
          Archived
        </button>
      ) : (
        <button
          onClick={toggleArchive}
          className="p-1.5 rounded transition-all text-th-tx-5 hover:text-th-tx-2 flex-shrink-0"
          title="Archive"
        >
          <Archive size={13} />
        </button>
      )}
    </div>
  )
}
