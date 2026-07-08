'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, Pencil, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminService,
  type AdminPaper,
  type PaperQuestion,
  type PoolQuestion,
  type PoolQuestionInput,
  type Subject,
  type Topic,
  type MediaSlot,
} from '@/services/admin.service';
import { isApiError } from '@/services/api-client';
import { AdminDialog, type DialogState } from '@/components/ui/AdminDialog';
import { ImageUpload, reconcileQuestionImages, type PendingImages } from '@/components/admin/ImageUpload';
import { PdfUpload } from '@/components/admin/PdfUpload';
import type { PaperPdfSlot } from '@/services/admin.service';

// ── Question form (shared for create / edit) ──────────────────────────────────

const EMPTY_Q: PoolQuestionInput = {
  question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
  correct_option: '1', explanation: '', subject_id: '', slug: '', is_pp: false,
};

function QuestionForm({
  initial,
  onSave,
  onCancel,
  saving,
  subjects,
}: {
  initial: PoolQuestionInput;
  onSave: (q: PoolQuestionInput, pending: PendingImages) => void;
  onCancel: () => void;
  saving: boolean;
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

  return (
    <div className="bg-dark rounded-sm p-4 flex flex-col gap-3 text-[12.5px]">
      <textarea
        className="admin-input resize-none"
        rows={2}
        placeholder="Question text"
        value={q.question_text}
        onChange={e => set('question_text', e.target.value)}
      />
      <ImageUpload
        label="Question image (optional)"
        pending={pending.question}
        onChange={next => setSlot('question', next)}
      />
      {(['a','b','c','d','e'] as const).map((opt, idx) => (
        <div key={opt} className="flex items-start gap-2">
          <label className="w-4 font-bold text-text-muted mt-2">{idx + 1}</label>
          <div className="flex-1 flex flex-col gap-1">
            <input
              className="admin-input"
              placeholder={`Option ${idx + 1}`}
              value={q[`option_${opt}` as keyof PoolQuestionInput] as string}
              onChange={e => set(`option_${opt}` as keyof PoolQuestionInput, e.target.value)}
            />
            <ImageUpload pending={pending[opt]} onChange={next => setSlot(opt, next)} />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <label className="text-text-muted text-[11.5px] font-semibold">Correct:</label>
        <select className="admin-input w-20" value={q.correct_option} onChange={e => set('correct_option', e.target.value)}>
          {['1','2','3','4','5'].map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <input className="admin-input" placeholder="Explanation (optional)" value={q.explanation} onChange={e => set('explanation', e.target.value)} />
      {/* Required — every question must belong to a subject (server enforces too) */}
      <select
        className="admin-input"
        value={q.subject_id ?? ''}
        onChange={e => { set('subject_id', e.target.value); setQ(prev => ({ ...prev, topic_id: null })); }}
      >
        <option value="" disabled>— select subject * —</option>
        {subjects.map(s => (
          <option key={s.id} value={s.id}>{s.name_si} ({s.id})</option>
        ))}
      </select>
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
      <label className="flex items-center gap-2 cursor-pointer text-[12px] text-text-primary">
        <input
          type="checkbox"
          checked={!!q.is_pp}
          onChange={e => setQ(prev => ({ ...prev, is_pp: e.target.checked }))}
          className="w-4 h-4 accent-brand cursor-pointer"
        />
        Past-paper question
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(q, pending)}
          disabled={saving || !q.subject_id}
          className="px-4 py-1.5 rounded-sm bg-brand text-white text-[12px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 cursor-pointer border-none"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-sm bg-dark border border-border-dim text-text-muted text-[12px] hover:border-gold transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Pool picker modal ─────────────────────────────────────────────────────────

function PoolPicker({
  onAttach,
  onClose,
}: {
  onAttach: (q: PoolQuestion) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PoolQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [attachingId, setAttachingId] = useState<number | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    adminService.listPoolQuestions({ slug_contains: debouncedSearch, limit: 20 })
      .then(r => setResults(r.questions))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  async function handleAttach(q: PoolQuestion) {
    setAttachingId(q.id);
    try {
      await onAttach(q);
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-base w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border-dim flex items-center justify-between">
          <h3 className="font-bold text-text-primary text-[13.5px]">Add from Question Pool</h3>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text-primary hover:bg-dark transition-colors bg-transparent border-none cursor-pointer"><X size={14} /></button>
        </div>
        <div className="p-4">
          <input
            className="admin-input w-full mb-3"
            placeholder="Search by slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {loading ? (
            <div className="py-4 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-text-muted text-[12.5px] text-center py-4">No questions found.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {results.map(q => (
                <li key={q.id} className="flex items-start gap-3 p-3 rounded-sm bg-dark hover:border-gold border border-transparent transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-text-primary truncate">{q.question_text}</div>
                    <div className="text-[10.5px] text-text-muted mt-0.5">{q.slug}</div>
                  </div>
                  <button
                    onClick={() => handleAttach(q)}
                    disabled={attachingId === q.id}
                    className="shrink-0 px-3 py-1 rounded-sm bg-brand text-white text-[11.5px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 cursor-pointer border-none"
                  >
                    {attachingId === q.id ? '…' : 'Attach'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type AddMode = null | 'pool' | 'new';

export default function PaperBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paperId } = use(params);
  const { user } = useAuth();
  const canDelete = user?.role === 'admin';

  const [paper, setPaper] = useState<AdminPaper | null>(null);
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [detachingId, setDetachingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    adminService.listSubjects().then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([adminService.getPaper(paperId), adminService.listPaperQuestions(paperId)])
      .then(([paper, qs]) => {
        setPaper(paper);
        setQuestions(qs);
      })
      .catch(() => setError('Failed to load paper'))
      .finally(() => setLoading(false));
  }, [paperId]);

  async function handleAttachFromPool(q: PoolQuestion) {
    try {
      const pq = await adminService.attachQuestion(paperId, { question_id: q.id });
      setQuestions(prev => [...prev, pq]);
      setAddMode(null);
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to attach question' });
    }
  }

  async function handleCreateAndAttach(input: PoolQuestionInput, pending: PendingImages) {
    setSavingNew(true);
    try {
      const pq = await adminService.attachQuestion(paperId, input);
      // Attach images now that the question id exists (orphan-free).
      if (Object.keys(pending).length > 0) {
        await reconcileQuestionImages(pq.id, pending);
        const fresh = await adminService.listPaperQuestions(paperId);
        setQuestions(fresh);
      } else {
        setQuestions(prev => [...prev, pq]);
      }
      setAddMode(null);
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to create question' });
    } finally {
      setSavingNew(false);
    }
  }

  function handleDetach(q: PaperQuestion) {
    setDialog({
      type: 'confirm',
      title: 'Remove Question',
      message: 'Remove this question from the paper?',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setDetachingId(q.id);
        try {
          await adminService.detachQuestion(paperId, q.id);
          setQuestions(prev => prev.filter(p => p.id !== q.id));
        } catch (err) {
          setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to detach' });
        } finally {
          setDetachingId(null);
        }
      },
    });
  }

  async function handleTogglePublish() {
    if (!paper) return;
    try {
      await adminService.publishPaper(paper.id, !paper.is_published);
      setPaper(p => p ? { ...p, is_published: !p.is_published } : p);
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to update paper' });
    }
  }

  async function handlePdfUpload(slot: PaperPdfSlot, file: File) {
    if (!paper) return;
    const { pdfs } = await adminService.uploadPaperPdf(paper.id, slot, file);
    setPaper(p => p ? { ...p, pdfs } : p);
  }

  async function handlePdfRemove(slot: PaperPdfSlot) {
    if (!paper) return;
    const { pdfs } = await adminService.deletePaperPdf(paper.id, slot);
    setPaper(p => p ? { ...p, pdfs } : p);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-danger text-[13px]">{error}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/papers" className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors">
            <ArrowLeft size={13} /> Back to Papers
          </Link>
          <h1 className="mt-2 text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {paper?.title ?? 'Paper Builder'}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-[12px] text-text-muted">
            <span className="uppercase font-medium">{paper?.type}</span>
            <span>·</span>
            <span>Grade {paper?.grade}</span>
            <span>·</span>
            <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button
          onClick={handleTogglePublish}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[12px] font-semibold border transition-colors cursor-pointer ${
            paper?.is_published
              ? 'bg-success/10 text-success border-success/20 hover:bg-danger/10 hover:text-danger hover:border-danger/20'
              : 'bg-brand/10 text-brand border-brand/20 hover:bg-brand hover:text-white'
          }`}
        >
          {paper?.is_published ? <><EyeOff size={13} /> Unpublish</> : <><Eye size={13} /> Publish</>}
        </button>
      </div>

      {/* Reference PDFs — past papers only */}
      {paper?.type === 'pastpaper' && (
        <div className="bg-surface rounded-base border border-border-dim mb-4 p-4">
          <div className="text-[13px] font-semibold text-text-primary mb-1">Reference PDFs</div>
          <p className="text-[11.5px] text-text-muted mb-3">
            Optional question-paper PDFs students can view. Question papers only — no answers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PdfUpload
              label="Structured Questions"
              currentUrl={paper.pdfs?.structured}
              onUpload={(f) => handlePdfUpload('structured', f)}
              onRemove={() => handlePdfRemove('structured')}
            />
            <PdfUpload
              label="Essay Questions"
              currentUrl={paper.pdfs?.essay}
              onUpload={(f) => handlePdfUpload('essay', f)}
              onRemove={() => handlePdfRemove('essay')}
            />
            <PdfUpload
              label="Answers (structured + essay)"
              hint="Openly viewable by students. MCQ answers stay protected."
              currentUrl={paper.pdfs?.answers}
              onUpload={(f) => handlePdfUpload('answers', f)}
              onRemove={() => handlePdfRemove('answers')}
            />
          </div>
        </div>
      )}

      {/* Question list */}
      <div className="bg-surface rounded-base border border-border-dim mb-4">
        <div className="px-4 py-3 border-b border-border-dim flex items-center justify-between">
          <span className="text-[13px] font-semibold text-text-primary">Questions</span>
          <div className="flex gap-2">
            <button
              onClick={() => setAddMode('pool')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-dark border border-border-dim text-[12px] text-text-muted hover:border-gold hover:text-gold transition-colors cursor-pointer"
            >
              <Database size={12} /> From Pool
            </button>
            <button
              onClick={() => setAddMode('new')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-brand text-white text-[12px] font-semibold hover:bg-brand-dark transition-colors cursor-pointer border-none"
            >
              <Pencil size={12} /> Author New
            </button>
          </div>
        </div>

        {addMode === 'new' && (
          <div className="p-4 border-b border-border-dim">
            <p className="text-[11.5px] text-text-muted mb-3">New question will be added to the pool and attached to this paper.</p>
            <QuestionForm
              initial={{ ...EMPTY_Q, subject_id: paper?.subject_id ?? '', is_pp: paper?.type === 'pastpaper' }}
              saving={savingNew}
              onSave={handleCreateAndAttach}
              onCancel={() => setAddMode(null)}
              subjects={subjects}
            />
          </div>
        )}

        {questions.length === 0 && addMode !== 'new' ? (
          <div className="p-8 text-center text-text-muted text-[13px]">
            No questions attached. Use the buttons above to add questions.
          </div>
        ) : (
          <ul>
            {questions
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((q, idx) => (
                <li key={q.id} className="flex items-start gap-3 px-4 py-3 border-b border-border-dim last:border-0">
                  <span className="w-6 h-6 rounded-full bg-dark text-text-muted text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-text-primary leading-snug">{q.question_text}</p>
                    <div className="flex gap-3 mt-1 text-[11px] text-text-muted">
                      <span>✓ {q.correct_option}</span>
                      <span>·</span>
                      <span>{q.slug}</span>
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => handleDetach(q)}
                      disabled={detachingId === q.id}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
                      title="Remove from paper"
                    >
                      {detachingId === q.id ? '…' : <Trash2 size={13} />}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Pool picker modal */}
      {addMode === 'pool' && (
        <PoolPicker
          onAttach={handleAttachFromPool}
          onClose={() => setAddMode(null)}
        />
      )}
      {dialog && <AdminDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
