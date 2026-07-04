'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, totalPages, onPage }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="px-4 py-3 border-t border-border-dim flex items-center justify-between text-[12px] text-text-muted">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-sm bg-dark border border-border-dim hover:border-gold transition-colors disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft size={13} /> Prev
        </button>
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-sm bg-dark border border-border-dim hover:border-gold transition-colors disabled:opacity-40 cursor-pointer"
        >
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
