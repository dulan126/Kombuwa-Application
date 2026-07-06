'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react';

const MAX_BYTES = 10 * 1024 * 1024;

interface PdfUploadProps {
  label: string;
  hint?: string;
  /** Existing gated PDF URL, if uploaded. */
  currentUrl?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}

/**
 * Admin control for a single reference PDF: upload / view / replace / remove.
 * Persists immediately via the parent-provided handlers.
 */
export function PdfUpload({ label, hint, currentUrl, onUpload, onRemove }: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function pick(file: File | undefined) {
    setErr('');
    if (!file) return;
    if (file.type !== 'application/pdf') { setErr('Only PDF files are allowed'); return; }
    if (file.size > MAX_BYTES) { setErr('PDF must be under 10 MB'); return; }
    setBusy(true);
    try {
      await onUpload(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setErr('');
    setBusy(true);
    try {
      await onRemove();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  }

  const ghost = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-dark border border-border-dim text-[11.5px] text-text-muted hover:border-gold hover:text-gold transition-colors cursor-pointer disabled:opacity-50';

  return (
    <div className="flex flex-col gap-1.5 bg-dark rounded-sm p-3 border border-border-dim">
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-text-muted shrink-0" />
        <span className="text-[12px] font-semibold text-text-primary">{label}</span>
        {currentUrl && <span className="text-[10.5px] text-success">● uploaded</span>}
      </div>
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        {currentUrl ? (
          <>
            <a href={currentUrl} target="_blank" rel="noopener noreferrer" className={ghost + ' no-underline'}>
              <ExternalLink size={11} /> View
            </a>
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={ghost}>
              <Upload size={11} /> Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-dark border border-border-dim text-[11.5px] text-text-muted hover:border-danger hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={11} /> Remove
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={ghost}>
            <Upload size={11} /> {busy ? 'Uploading…' : 'Upload PDF'}
          </button>
        )}
      </div>
      {err && <span className="text-[10.5px] text-danger">{err}</span>}
    </div>
  );
}
