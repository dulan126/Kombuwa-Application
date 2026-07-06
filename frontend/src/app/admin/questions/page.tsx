'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash2, X, ArrowLeft, Database } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { SubjectCards } from '@/components/admin/SubjectCards';
import { useAuth } from '@/hooks/useAuth';
import {
  adminService,
  type PoolQuestion,
  type PoolQuestionInput,
  type Subject,
  type Topic,
  type SubjectSummary,
  type MediaSlot,
} from '@/services/admin.service';
import { isApiError } from '@/services/api-client';
import { AdminDialog, type DialogState } from '@/components/ui/AdminDialog';
import { ImageUpload, reconcileQuestionImages, type PendingImages } from '@/components/admin/ImageUpload';

const EMPTY_Q: PoolQuestionInput = {
  question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
  correct_option: 'A', explanation: '', subject_id: '', slug: '',
};

function QuestionModal({
  initial,
  existingImages,
  onSave,
  onClose,
  saving,
  title,
  subjects,
}: {
  initial: PoolQuestionInput;
  existingImages?: Partial<Record<MediaSlot, string>>;
  onSave: (q: PoolQuestionInput, pending: PendingImages) => void;
  onClose: () => void;
  saving: boolean;
  title: string;
  subjects: Subject[];
}) {
  const [q, setQ] = useState<PoolQuestionInput>(initial);
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [pending, setPending] = useState<PendingImages>({});
  const set = (k: keyof PoolQuestionInput, v: string) => setQ(prev => ({ ...prev, [k]: v }));
  const setSlot = (slot: MediaSlot, next: File | null | undefined) =>
    setPending(prev => {
      const cp = { ...prev };
      if (next === undefined) delete cp[slot];
      else cp[slot] = next;
      return cp;
    });

  useEffect(() => {
    if (!q.subject_id) { setAvailableTopics([]); setQ(prev => ({ ...prev, topic_id: null })); return; }
    adminService.listTopics(q.subject_id).then(setAvailableTopics).catch(() => setAvailableTopics([]));
  }, [q.subject_id]);

  // Every question must have a subject (enforced server-side too).
  const missingSubject = !q.subject_id;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-base w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border-dim flex items-center justify-between sticky top-0 bg-surface">
          <h3 className="font-bold text-text-primary text-[13.5px]">{title}</h3>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text-primary hover:bg-dark transition-colors bg-transparent border-none cursor-pointer"><X size={14} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3 text-[12.5px]">
          <textarea
            className="admin-input resize-none"
            rows={3}
            placeholder="Question text"
            value={q.question_text}
            onChange={e => set('question_text', e.target.value)}
          />
          <ImageUpload
            label="Question image (optional)"
            existingUrl={existingImages?.question}
            pending={pending.question}
            onChange={next => setSlot('question', next)}
          />
          {(['a','b','c','d','e'] as const).map(opt => (
            <div key={opt} className="flex items-start gap-2">
              <label className="w-4 font-bold text-text-muted uppercase mt-2">{opt}</label>
              <div className="flex-1 flex flex-col gap-1">
                <input
                  className="admin-input"
                  placeholder={`Option ${opt.toUpperCase()}`}
                  value={q[`option_${opt}` as keyof PoolQuestionInput] as string}
                  onChange={e => set(`option_${opt}` as keyof PoolQuestionInput, e.target.value)}
                />
                <ImageUpload
                  existingUrl={existingImages?.[opt]}
                  pending={pending[opt]}
                  onChange={next => setSlot(opt, next)}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <label className="text-text-muted text-[11.5px] font-semibold w-16">Correct:</label>
            <select className="admin-input w-20" value={q.correct_option} onChange={e => set('correct_option', e.target.value)}>
              {['A','B','C','D','E'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <input className="admin-input" placeholder="Explanation (optional)" value={q.explanation} onChange={e => set('explanation', e.target.value)} />
          <div>
            <label className="text-text-muted text-[11.5px] font-semibold">Subject *</label>
            <select
              className="admin-input mt-1 w-full"
              value={q.subject_id ?? ''}
              onChange={e => { set('subject_id', e.target.value); setQ(prev => ({ ...prev, topic_id: null })); }}
            >
              <option value="" disabled>— select subject —</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name_si} ({s.id})</option>
              ))}
            </select>
            {missingSubject && (
              <p className="text-[11px] text-danger mt-1">Every question must belong to a subject.</p>
            )}
          </div>
          {availableTopics.length > 0 && (
            <select
              className="admin-input"
              value={q.topic_id ?? ''}
              onChange={e => setQ(prev => ({ ...prev, topic_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— topic (optional) —</option>
              {availableTopics.map(t => (
                <option key={t.id} value={t.id}>{t.name_si}</option>
              ))}
            </select>
          )}
          <input className="admin-input" placeholder="Slug (auto-generated if blank)" value={q.slug} onChange={e => set('slug', e.target.value)} />
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onSave(q, pending)}
              disabled={saving || missingSubject}
              className="px-4 py-2 rounded-sm bg-brand text-white text-[12.5px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 cursor-pointer border-none"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-sm bg-dark border border-border-dim text-text-muted text-[12.5px] hover:border-gold transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Landing: one card per subject ─────────────────────────────────────────────

function QuestionsLanding() {
  const [summaries, setSummaries] = useState<SubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

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
          Question Pool
        </h1>
        <p className="text-text-muted text-[12.5px] mt-0.5">Pick a subject to manage its questions.</p>
      </div>

      <SubjectCards
        summaries={summaries}
        loading={loading}
        icon={<Database size={18} />}
        hrefFor={(s) => `/admin/questions?subject=${s.id}`}
        statsFor={(s) =>
          s.question_count === 0
            ? { primary: null }
            : { primary: `${s.question_count} question${s.question_count !== 1 ? 's' : ''}` }
        }
        emptyLabel="No questions yet"
      />
    </div>
  );
}

// ── Scoped table: one subject ─────────────────────────────────────────────────

function QuestionsTable({ subjectId }: { subjectId: string }) {
  const { user } = useAuth();
  const canDelete = user?.role === 'admin';

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [questions, setQuestions] = useState<PoolQuestion[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    adminService.listSubjects().then(setSubjects).catch(() => {});
  }, []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; q: PoolQuestion }>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const subjectName = subjects.find((s) => s.id === subjectId)?.name_si ?? subjectId;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.listPoolQuestions({
        subject_id: subjectId,
        slug_contains: debouncedSearch || undefined,
        page,
        limit: LIMIT,
      });
      setQuestions(res.questions ?? []);
      setTotal(res.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [subjectId, debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(input: PoolQuestionInput, pending: PendingImages) {
    setSaving(true);
    try {
      let savedId: number;
      if (modal?.mode === 'edit') {
        const updated = await adminService.updatePoolQuestion(modal.q.id, input);
        savedId = updated.id;
      } else {
        // Create first, then attach images (files are only sent once the id
        // exists → no orphaned uploads).
        const created = await adminService.createPoolQuestion(input);
        savedId = created.id;
      }
      await reconcileQuestionImages(savedId, pending);
      setModal(null);
      // Reload so image URLs (and the new/updated row) reflect the latest state.
      await load();
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to save question' });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(q: PoolQuestion) {
    setDialog({
      type: 'confirm',
      title: 'Delete Question',
      message: `Delete "${q.slug}"? This will fail if it's still attached to any paper.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDeletingId(q.id);
        try {
          await adminService.deletePoolQuestion(q.id);
          setQuestions(prev => prev.filter(p => p.id !== q.id));
          setTotal(t => t - 1);
        } catch (err) {
          setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to delete' });
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/questions"
            className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors"
          >
            <ArrowLeft size={12} /> All subjects
          </Link>
          <h1 className="mt-1 text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {subjectName} — Question Pool
          </h1>
          <p className="text-text-muted text-[12.5px] mt-0.5">{total} questions total</p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-[12.5px] font-semibold hover:bg-brand-dark transition-colors cursor-pointer border-none"
        >
          <Plus size={13} /> New Question
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          className="admin-input max-w-xs"
          placeholder="Search by slug…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-surface rounded-base border border-border-dim overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">
            No questions for this subject yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border-dim bg-dark">
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Slug</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Question</th>
                  <th className="text-right px-4 py-3 text-text-muted font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map(q => (
                  <tr
                    key={q.id}
                    className={`border-b border-border-dim last:border-0 hover:bg-dark/50 ${q.is_pp ? 'bg-aqua/6' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <code className="text-[11.5px] text-brand">{q.slug}</code>
                        {q.is_pp && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-aqua/15 text-aqua border border-aqua/30" title="Authored from a past paper">
                            pp
                          </span>
                        )}
                        {!q.option_e && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-warning/10 text-warning border border-warning/20" title="Missing the 5th option — edit to complete">
                            4 options
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-primary max-w-xs">
                      <div className="truncate">{q.question_text}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal({ mode: 'edit', q })}
                          className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-gold hover:bg-gold/10 transition-colors bg-transparent border-none cursor-pointer"
                          title="Edit question"
                        >
                          <Pencil size={13} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(q)}
                            disabled={deletingId === q.id}
                            className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
                            title="Delete question"
                          >
                            {deletingId === q.id ? '…' : <Trash2 size={13} />}
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

        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </div>

      {modal && (
        <QuestionModal
          title={modal.mode === 'create' ? 'New Question' : 'Edit Question'}
          initial={modal.mode === 'edit'
            ? { ...modal.q, explanation: modal.q.explanation ?? '', subject_id: modal.q.subject_id ?? '', slug: modal.q.slug }
            : { ...EMPTY_Q, subject_id: subjectId }}
          existingImages={modal.mode === 'edit' ? modal.q.images : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          subjects={subjects}
        />
      )}
      {dialog && <AdminDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ── Page: branch on ?subject= ─────────────────────────────────────────────────

function QuestionsPageInner() {
  const subject = useSearchParams().get('subject');
  if (!subject) return <QuestionsLanding />;
  // key guarantees a full state reset (page/search → defaults) on subject change.
  return <QuestionsTable key={subject} subjectId={subject} />;
}

export default function QuestionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      }
    >
      <QuestionsPageInner />
    </Suspense>
  );
}
