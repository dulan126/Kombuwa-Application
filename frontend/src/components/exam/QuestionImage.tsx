'use client';

import { useState } from 'react';

interface QuestionImageProps {
  /** Gated image URL, or undefined when the slot has no image. */
  src?: string;
  alt: string;
  className?: string;
}

/**
 * Renders a question/answer image only when present. Lazy-loaded; hides itself
 * on load error so a missing/forbidden image never shows a broken-image icon.
 * Shared by the exam view and the marking-scheme review.
 */
export function QuestionImage({ src, alt, className }: QuestionImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className ?? 'max-h-64 max-w-full rounded-[10px] border border-border-dim object-contain'}
    />
  );
}
