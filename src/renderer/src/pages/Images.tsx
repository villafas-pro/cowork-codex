import React, { useEffect, useState, useCallback } from 'react'
import { FileText, X, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface ImageEntry {
  noteId: string
  noteTitle: string
  noteUpdatedAt: number
  src: string
  index: number
}

export default function Images(): React.JSX.Element {
  const { openTab } = useAppStore()
  const [images, setImages] = useState<ImageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null) // index into images array

  useEffect(() => {
    loadImages()
  }, [])

  async function loadImages(): Promise<void> {
    setLoading(true)
    try {
      const fn = window.api?.notes?.getImages
      if (typeof fn !== 'function') {
        console.error('[Images] window.api.notes.getImages is not a function — restart the app')
        setImages([])
        return
      }
      const result = await fn()
      console.log('[Images] loaded', result?.length ?? 0, 'images')
      setImages(result || [])
    } catch (e) {
      console.error('[Images] loadImages error:', e)
      setImages([])
    } finally {
      setLoading(false)
    }
  }

  const openLightbox = (i: number): void => setLightbox(i)
  const closeLightbox = (): void => setLightbox(null)

  const prevImage = useCallback((): void => {
    setLightbox((i) => (i !== null ? (i - 1 + images.length) % images.length : null))
  }, [images.length])

  const nextImage = useCallback((): void => {
    setLightbox((i) => (i !== null ? (i + 1) % images.length : null))
  }, [images.length])

  useEffect(() => {
    if (lightbox === null) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') prevImage()
      if (e.key === 'ArrowRight') nextImage()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightbox, prevImage, nextImage])

  // Group images by note
  const byNote = images.reduce<Record<string, { title: string; updatedAt: number; items: (ImageEntry & { globalIdx: number })[] }>>(
    (acc, img, globalIdx) => {
      if (!acc[img.noteId]) {
        acc[img.noteId] = { title: img.noteTitle, updatedAt: img.noteUpdatedAt, items: [] }
      }
      acc[img.noteId].items.push({ ...img, globalIdx })
      return acc
    },
    {}
  )

  const noteGroups = Object.entries(byNote).sort((a, b) => b[1].updatedAt - a[1].updatedAt)

  const currentImg = lightbox !== null ? images[lightbox] : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#383838] flex-shrink-0">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} className="text-[#888]" />
          <h1 className="text-sm font-medium text-[#d0d0d0]">Images</h1>
          {!loading && (
            <span className="text-xs text-[#555]">{images.length} image{images.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <p className="text-xs text-[#555] text-center py-12">Loading...</p>
        )}
        {!loading && images.length === 0 && (
          <div className="text-center py-16">
            <ImageIcon size={32} className="text-[#333] mx-auto mb-3" />
            <p className="text-sm text-[#555]">No images yet</p>
            <p className="text-xs text-[#444] mt-1">Paste or drag images into any note</p>
          </div>
        )}

        {!loading && noteGroups.map(([noteId, group]) => (
          <div key={noteId} className="mb-8">
            {/* Note label */}
            <button
              onClick={() => openTab({ entityType: 'note', entityId: noteId, title: group.title })}
              className="flex items-center gap-2 mb-3 text-left group"
            >
              <FileText size={12} className="text-[#666]" />
              <span className="text-xs text-[#888] group-hover:text-accent transition-colors">
                {group.title}
              </span>
              <span className="text-xs text-[#555]">· {group.items.length} image{group.items.length !== 1 ? 's' : ''}</span>
            </button>

            {/* Image grid */}
            <div className="grid grid-cols-4 gap-2">
              {group.items.map((img) => (
                <button
                  key={`${img.noteId}-${img.index}`}
                  onClick={() => openLightbox(img.globalIdx)}
                  className="relative aspect-square rounded-lg overflow-hidden border border-[#2e2e2e] hover:border-[#e8b800] transition-all group bg-[#1a1a1a]"
                >
                  <img
                    src={img.src}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox !== null && currentImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-lg text-[#888] hover:text-white hover:bg-[#222] transition-all"
          >
            <X size={18} />
          </button>

          {/* Note label */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              openTab({ entityType: 'note', entityId: currentImg.noteId, title: currentImg.noteTitle })
              closeLightbox()
            }}
            className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#222] text-xs text-[#aaa] hover:text-accent transition-colors"
          >
            <FileText size={11} />
            {currentImg.noteTitle}
          </button>

          {/* Prev */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prevImage() }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#888] hover:text-white hover:bg-[#222] transition-all"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Image */}
          <img
            src={currentImg.src}
            alt=""
            className="max-w-[80vw] max-h-[80vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); nextImage() }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#888] hover:text-white hover:bg-[#222] transition-all"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-[#666]">
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  )
}
