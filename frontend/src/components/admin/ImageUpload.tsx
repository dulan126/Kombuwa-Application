'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { adminService, type MediaSlot } from '@/services/admin.service';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Per-slot pending change: File = add/replace, null = remove. Absent = unchanged. */
export type PendingImages = Partial<Record<MediaSlot, File | null>>;

export const MEDIA_SLOTS: MediaSlot[] = ['question', 'a', 'b', 'c', 'd', 'e'];

/**
 * Applies pending image changes for a question after it exists (id known):
 * uploads new files, deletes removed slots. Shared by every question editor.
 */
export async function reconcileQuestionImages(id: number, pending: PendingImages): Promise<void> {
  for (const slot of MEDIA_SLOTS) {
    const change = pending[slot];
    if (change instanceof File) {
      await adminService.uploadQuestionMedia(id, slot, change);
    } else if (change === null) {
      await adminService.deleteQuestionMedia(id, slot);
    }
  }
}

interface ImageUploadProps {
  /** Currently-saved gated image URL, if any. */
  existingUrl?: string;
  /** Parent-held pending change for this slot: File | null | undefined. */
  pending: File | null | undefined;
  /** Emit a File (add/replace), null (remove saved), or undefined (unchanged). */
  onChange: (next: File | null | undefined) => void;
  label?: string;
}

/**
 * Controlled image control with preview + replace + remove. Purely presentational:
 * the parent decides when to persist (via reconcileQuestionImages).
 */
export function ImageUpload({ existingUrl, pending, onChange, label }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pending instanceof File) {
      const u = URL.createObjectURL(pending);
      setBlobUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setBlobUrl(null);
  }, [pending]);

  const removed = pending === null;
  const previewSrc = pending instanceof File ? blobUrl : removed ? null : existingUrl ?? null;

  function pick(file: File | undefined) {
    setErr('');
    if (!file) return;
    if (!ACCEPT.includes(file.type)) { setErr('JPEG, PNG, or WebP only'); return; }
    if (file.size > MAX_BYTES) { setErr('Image must be under 5 MB'); return; }
    onChange(file);
  }

  function remove() {
    setErr('');
    // Removing a saved image marks it for deletion; removing an unsaved pick just reverts.
    onChange(existingUrl ? null : undefined);
  }

  const ghost = 'inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-dark border border-border-dim text-[11px] text-text-muted hover:border-gold hover:text-gold transition-colors cursor-pointer';

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[11px] text-text-muted font-semibold">{label}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      {previewSrc ? (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt={label ?? 'question image'} className="max-h-20 rounded-sm border border-border-dim object-contain" />
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => inputRef.current?.click()} className={ghost}>
              <RefreshCw size={11} /> Replace
            </button>
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-dark border border-border-dim text-[11px] text-text-muted hover:border-danger hover:text-danger transition-colors cursor-pointer"
            >
              <Trash2 size={11} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className={ghost}>
          <ImagePlus size={12} /> Add image
        </button>
      )}
      {err && <span className="text-[10.5px] text-danger">{err}</span>}
    </div>
  );
}
