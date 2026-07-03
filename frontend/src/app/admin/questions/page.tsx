'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminService,
  type PoolQuestion,
  type PoolQuestionInput,
  type Subject,
} from '@/services/admin.service';
import { isApiError } from '@/services/api-client';

const EMPTY_Q: PoolQuestionInput = {
  question_text: '', option_a: '', option_b: '', option_c: '', option_d: '',
  correct_option: 'A', explanation: '', subject_id: '', slug: '',
};

function QuestionModal({
  initial,
  onSave,
  onClose,
  saving,
  title,
  subjects,
}: {
  initial: PoolQuestionInput;
  onSave: (q: PoolQuestionInput) => void;
  onClose: () => void;
  saving: boolean;
  title: string;
  subjects: Subject[];
}) {
  const [q, setQ] = useState<PoolQuestionInput>(initial);
  const set = (k: keyof PoolQuestionInput, v: string) => setQ(prev => ({ ...prev, [k]: v }));

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
          {(['a','b','c','d'] as const).map(opt => (
            <div key={opt} className="flex items-center gap-2">
              <label className="w-4 font-bold text-text-muted uppercase">{opt}</label>
              <input
                className="admin-input flex-1"
                placeholder={`Option ${opt.toUpperCase()}`}
                value={q[`option_${opt}` as keyof PoolQuestionInput] as string}
                onChange={e => set(`option_${opt}` as keyof PoolQuestionInput, e.target.value)}
              />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <label className="text-text-muted text-[11.5px] font-semibold w-16">Correct:</label>
            <select className="admin-input w-20" value={q.correct_option} onChange={e => set('correct_option', e.target.value)}>
              {['A','B','C','D'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <input className="admin-input" placeholder="Explanation (optional)" value={q.explanation} onChange={e => set('explanation', e.target.value)} />
          <select className="admin-input" value={q.subject_id ?? ''} onChange={e => set('subject_id', e.target.value)}>
            <option value="">— subject (optional) —</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name_si} ({s.id})</option>
            ))}
          </select>
          <input className="admin-input" placeholder="Slug (auto-generated if blank)" value={q.slug} onChange={e => set('slug', e.target.value)} />
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onSave(q)}
              disabled={saving}
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

export default function QuestionsPage() {
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

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.listPoolQuestions({
        slug_contains: debouncedSearch || undefined,
        page,
        limit: LIMIT,
      });
      setQuestions(res.questions);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(input: PoolQuestionInput) {
    setSaving(true);
    try {
      if (modal?.mode === 'edit') {
        const updated = await adminService.updatePoolQuestion(modal.q.id, input);
        setQuestions(prev => prev.map(q => q.id === updated.id ? updated : q));
      } else {
        const created = await adminService.createPoolQuestion(input);
        setQuestions(prev => [created, ...prev]);
        setTotal(t => t + 1);
      }
      setModal(null);
    } catch (err) {
      alert(isApiError(err) ? err.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(q: PoolQuestion) {
    if (!confirm(`Delete question "${q.slug}"? This will fail if it's still attached to any paper.`)) return;
    setDeletingId(q.id);
    try {
      await adminService.deletePoolQuestion(q.id);
      setQuestions(prev => prev.filter(p => p.id !== q.id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(isApiError(err) ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Question Pool
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
          <div className="p-8 text-center text-text-muted text-[13px]">No questions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border-dim bg-dark">
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Slug</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Question</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Subject</th>
                  <th className="text-right px-4 py-3 text-text-muted font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map(q => (
                  <tr key={q.id} className="border-b border-border-dim last:border-0 hover:bg-dark/50">
                    <td className="px-4 py-3">
                      <code className="text-[11.5px] text-brand">{q.slug}</code>
                    </td>
                    <td className="px-4 py-3 text-text-primary max-w-xs">
                      <div className="truncate">{q.question_text}</div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{q.subject_id || '—'}</td>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border-dim flex items-center justify-between text-[12px] text-text-muted">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-sm bg-dark border border-border-dim hover:border-gold transition-colors disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-sm bg-dark border border-border-dim hover:border-gold transition-colors disabled:opacity-40 cursor-pointer"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <QuestionModal
          title={modal.mode === 'create' ? 'New Question' : 'Edit Question'}
          initial={modal.mode === 'edit'
            ? { ...modal.q, explanation: modal.q.explanation ?? '', subject_id: modal.q.subject_id ?? '', slug: modal.q.slug }
            : EMPTY_Q}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          subjects={subjects}
        />
      )}
    </div>
  );
}
