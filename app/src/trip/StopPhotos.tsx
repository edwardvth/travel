import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Star, Trash2, X } from './icons'
import { photoBytes, resizeToDataUrl } from './photo'

/** Soft thresholds for the gentle "this is getting heavy" note. */
const SOFT_COUNT = 6
const SOFT_BYTES = 1.5 * 1024 * 1024 // ~1.5 MB of photos on one stop

export interface StopPhotosProps {
  /** The stop's photos (data URLs); first is the cover. */
  photos: string[]
  /** Stop name — used to build descriptive alt text. */
  stopName: string
  /** Whether the viewer may add/cover/delete. */
  canEdit: boolean
  /** Append resized data URLs to the stop's photos (immutable upstream). */
  onAdd: (dataUrls: string[]) => void
  /** Move the photo at `index` to position 0 (new cover). */
  onSetCover: (index: number) => void
  /** Remove the photo at `index`. */
  onRemove: (index: number) => void
}

/**
 * Per-stop photo gallery with a lightbox. Edit affordances (add / set cover /
 * delete) are gated by `canEdit`; view-only users still get the grid and
 * lightbox. Photos are small JPEG data URLs (see `photo.ts`) stored inline in
 * the trip JSON, so a gentle inline note appears when a stop gets heavy.
 */
export function StopPhotos({
  photos, stopName, canEdit, onAdd, onSetCover, onRemove,
}: StopPhotosProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const heavy = photos.length > SOFT_COUNT || photoBytes(photos) > SOFT_BYTES

  async function handleFiles(files: FileList | null) {
    if (!canEdit || !files || files.length === 0) return
    setBusy(true)
    setError(null)
    const list = Array.from(files).sort((a, b) => a.lastModified - b.lastModified)
    const added: string[] = []
    let failed = 0
    for (const file of list) {
      try {
        added.push(await resizeToDataUrl(file))
      } catch {
        failed += 1
      }
    }
    if (added.length) onAdd(added)
    if (failed) {
      setError(
        failed === list.length
          ? 'Those photos couldn’t be added. JPEG or PNG work best.'
          : `${failed} photo${failed > 1 ? 's' : ''} couldn’t be added.`,
      )
    }
    setBusy(false)
  }

  const hasPhotos = photos.length > 0
  if (!hasPhotos && !canEdit) return null

  return (
    <section aria-label="Photos">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif text-xl">Photos</h2>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 min-h-[44px] rounded-btn px-3.5 text-[13px] font-bold bg-fill text-ink hover:bg-fill-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
            >
              {busy
                ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <ImagePlus size={15} aria-hidden="true" />}
              {busy ? 'Adding…' : hasPhotos ? 'Add photos' : 'Add photo'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={e => {
                void handleFiles(e.target.files)
                e.target.value = '' // allow re-picking the same file
              }}
            />
          </>
        )}
      </div>

      {error && (
        <p className="text-[13px] text-sig bg-sig/5 border border-sig/20 rounded-card px-4 py-2.5 mb-3">
          {error}
        </p>
      )}

      {hasPhotos ? (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((src, i) => (
            <li
              key={i}
              className="group relative aspect-square rounded-card overflow-hidden bg-raised border border-hair"
            >
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link focus-visible:ring-inset"
                aria-label={`View photo ${i + 1} of ${stopName}`}
              >
                <img
                  src={src}
                  alt={`${stopName} — photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>

              {i === 0 && (
                <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/55 text-white px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-sm">
                  <Star size={10} fill="currentColor" aria-hidden="true" />
                  Cover
                </span>
              )}

              {canEdit && (
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => onSetCover(i)}
                      aria-label={`Set photo ${i + 1} as cover`}
                      title="Set as cover"
                      className="grid place-items-center w-7 h-7 rounded-md bg-black/55 text-white hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <Star size={13} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    aria-label={`Delete photo ${i + 1}`}
                    title="Delete photo"
                    className="grid place-items-center w-7 h-7 rounded-md bg-black/55 text-white hover:bg-sig focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full grid place-items-center gap-2 py-8 rounded-card border border-dashed border-hair-strong text-muted hover:bg-fill hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <ImagePlus size={22} aria-hidden="true" />
            <span className="text-[13px] font-semibold">Add your first photo</span>
          </button>
        )
      )}

      {heavy && canEdit && (
        <p className="text-[12px] text-muted mt-2.5">
          That’s a lot of photos for one stop — they’re saved inside your trip, so
          a few favourites keeps things speedy.
        </p>
      )}

      {lightbox !== null && photos[lightbox] && (
        <Lightbox
          src={photos[lightbox]}
          alt={`${stopName} — photo ${lightbox + 1}`}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  )
}

/** A minimal full-view overlay: esc / backdrop / close button dismiss; focus-trapped. */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    // Cache the opener so focus returns there on close (not lost to <body>).
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      // Single focusable element → trap Tab onto the close button.
      if (e.key === 'Tab') {
        e.preventDefault()
        closeRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 motion-safe:animate-[voyager-fade-in_120ms_ease-out]"
    >
      <style>{'@keyframes voyager-fade-in{from{opacity:0}to{opacity:1}}'}</style>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-3 right-3 grid place-items-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X size={22} aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={e => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-card shadow-card"
      />
    </div>
  )
}
