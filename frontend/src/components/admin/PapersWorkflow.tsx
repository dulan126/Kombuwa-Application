'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Trash2, Pencil, Plus, ArrowLeft, FileText, Star, FileStack } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminService,
  type AdminPaper,
  type SubjectSummary,
} from '@/services/admin.service';
import { isApiError } from '@/services/api-client';
import { AdminDialog, type DialogState } from '@/components/ui/AdminDialog';
import { Pagination } from '@/components/ui/Pagination';
import { SubjectCards } from '@/components/admin/SubjectCards';

const LIMIT = 50;

const TYPE_META = {
  daily:     { title: 'Daily MCQ', noun: 'daily papers', icon: <FileText size={18} /> },
  srp:       { title: 'SRP Papers', noun: 'SRP papers', icon: <Star size={18} /> },
  pastpaper: { title: 'Past Papers', noun: 'past papers', icon: <FileStack size={18} /> },
} as const;

export type PaperWorkflowType = keyof typeof TYPE_META;

// Per-type accessors into the subject summary counts.
function typeCounts(type: PaperWorkflowType, s: SubjectSummary): { count: number; published: number } {
  switch (type) {
    case 'daily':     return { count: s.daily_count, published: s.daily_published };
    case 'srp':       return { count: s.srp_count, published: s.srp_published };
    case 'pastpaper': return { count: s.pastpaper_count, published: s.pastpaper_published };
  }
}

// ── Landing: one card per subject ─────────────────────────────────────────────

function PapersLanding({ type }: { type: PaperWorkflowType }) {
  const [summaries, setSummaries] = useState<SubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const meta = TYPE_META[type];

  useEffect(() => {
    adminService.getSubjectSummary()
      .then((data) => setSummaries(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          {meta.title}
        </h1>
        <p className="text-text-muted text-[12.5px] mt-0.5">Pick a subject to manage its {meta.noun}.</p>
      </div>

      <SubjectCards
        summaries={summaries}
        loading={loading}
        icon={meta.icon}
        hrefFor={(s) => `/admin/papers/${type}?subject=${s.id}`}
        statsFor={(s) => {
          const { count, published } = typeCounts(type, s);
          if (count === 0) return { primary: null };
          return {
            primary: `${count} paper${count !== 1 ? 's' : ''}`,
            secondary: `${published} published · ${count - published} draft`,
          };
        }}
        emptyLabel={`No ${meta.noun} yet`}
      />
    </div>
  );
}

// ── Scoped table: one subject, one type ───────────────────────────────────────

function PapersTable({ type, subjectId }: { type: PaperWorkflowType; subjectId: string }) {
  const { user } = useAuth();
  const [papers, setPapers] = useState<AdminPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const meta = TYPE_META[type];

  useEffect(() => {
    adminService.listSubjects()
      .then((subs) => setSubjectName(subs.find((s) => s.id === subjectId)?.name_si ?? subjectId))
      .catch(() => setSubjectName(subjectId));
  }, [subjectId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.listPapers({ page, limit: LIMIT, subject_id: subjectId, type });
      setPapers(data.papers ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Failed to load papers');
    } finally {
      setLoading(false);
    }
  }, [page, subjectId, type]);

  useEffect(() => { load(); }, [load]);

  async function togglePublish(paper: AdminPaper) {
    setTogglingId(paper.id);
    try {
      await adminService.publishPaper(paper.id, !paper.is_published);
      setPapers(prev =>
        prev.map(p => p.id === paper.id ? { ...p, is_published: !p.is_published } : p)
      );
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to update paper' });
    } finally {
      setTogglingId(null);
    }
  }

  function deletePaper(paper: AdminPaper) {
    setDialog({
      type: 'confirm',
      title: 'Delete Paper',
      message: `Delete "${paper.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDeletingId(paper.id);
        try {
          await adminService.deletePaper(paper.id);
          setPapers(prev => prev.filter(p => p.id !== paper.id));
          setTotal(t => t - 1);
        } catch (err) {
          setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to delete paper' });
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  const canDelete = user?.role === 'admin';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/admin/papers/${type}`}
            className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors"
          >
            <ArrowLeft size={12} /> All subjects
          </Link>
          <h1 className="mt-1 text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {subjectName} — {meta.title}
          </h1>
          <p className="text-text-muted text-[12.5px] mt-0.5">{total} paper{total !== 1 ? 's' : ''} total</p>
        </div>
        <Link
          href={`/admin/papers/new?subject=${subjectId}&type=${type}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-[12.5px] font-semibold no-underline hover:bg-brand-dark transition-colors"
        >
          <Plus size={13} /> New Paper
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-sm bg-danger/10 border border-danger/20 text-danger text-[12.5px]">
          {error}
        </div>
      )}

      <div className="bg-surface rounded-base border border-border-dim overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : papers.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">
            No {meta.noun} for this subject yet. Create the first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border-dim bg-dark">
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Title</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Qs</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Attempts</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Status</th>
                  <th className="text-right px-4 py-3 text-text-muted font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {papers.map(paper => (
                  <tr key={paper.id} className="border-b border-border-dim last:border-0 hover:bg-dark/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{paper.title}</div>
                      {paper.grade && <div className="text-text-muted text-[11px]">Grade {paper.grade}</div>}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{paper.question_count}</td>
                    <td className="px-4 py-3 text-text-muted">{paper.attempt_count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublish(paper)}
                        disabled={togglingId === paper.id}
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                          paper.is_published
                            ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                            : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'
                        } disabled:opacity-50`}
                      >
                        {togglingId === paper.id ? '…' : paper.is_published ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/papers/${paper.id}`}
                          className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-gold hover:bg-gold/10 transition-colors no-underline"
                          title="Edit paper"
                        >
                          <Pencil size={13} />
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => deletePaper(paper)}
                            disabled={deletingId === paper.id}
                            className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
                            title="Delete paper"
                          >
                            {deletingId === paper.id ? '…' : <Trash2 size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.ceil(total / LIMIT)} onPage={setPage} />
      </div>
      {dialog && <AdminDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ── Workflow: branch on ?subject= ─────────────────────────────────────────────

function WorkflowInner({ type }: { type: PaperWorkflowType }) {
  const subject = useSearchParams().get('subject');
  if (!subject) return <PapersLanding type={type} />;
  // key guarantees a full state reset (page → 1) when switching subjects.
  return <PapersTable key={subject} type={type} subjectId={subject} />;
}

/** Subject-card landing → subject-scoped table, for one paper type. */
export function PapersWorkflow({ type }: { type: PaperWorkflowType }) {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      }
    >
      <WorkflowInner type={type} />
    </Suspense>
  );
}
