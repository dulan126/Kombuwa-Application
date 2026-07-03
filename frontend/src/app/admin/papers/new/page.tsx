'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminService, type Subject } from '@/services/admin.service';
import { isApiError } from '@/services/api-client';

const PAPER_TYPES = [
  { value: 'daily', label: 'Daily MCQ (10 questions)' },
  { value: 'srp',   label: 'SRP Paper (30 questions)' },
];

const GRADES = [
  { value: '12', label: 'Grade 12' },
  { value: '13', label: 'Grade 13' },
];

// Convert a YYYY-MM-DD date string to SLST (UTC+5:30) start/end ISO timestamps
function toSlstStart(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}
function toSlstEnd(date: string): string {
  return new Date(`${date}T23:59:59+05:30`).toISOString();
}

export default function NewPaperPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    adminService.listSubjects().then(setSubjects).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    title:        '',
    type:         'daily',
    subject_id:   '',
    grade:        '13',
    time_seconds: 1800,
    date:         '',
  });

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title || !form.subject_id || !form.date) {
      setError('Title, subject, and date are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { id } = await adminService.createDraftPaper({
        type:            form.type,
        subject_id:      form.subject_id,
        grade:           form.grade,
        title:           form.title,
        time_seconds:    form.time_seconds,
        available_from:  toSlstStart(form.date),
        available_until: toSlstEnd(form.date),
      });
      router.push(`/admin/papers/${id}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to create paper');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/admin/papers" className="text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors">
          ← Back to Papers
        </Link>
        <h1 className="mt-3 text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          New Paper
        </h1>
        <p className="text-text-muted text-[12.5px]">Creates a draft. Add questions in the builder.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface rounded-base border border-border-dim p-6 flex flex-col gap-4">
        {error && (
          <div className="p-3 rounded-sm bg-danger/10 border border-danger/20 text-danger text-[12.5px]">
            {error}
          </div>
        )}

        <Field label="Title">
          <input
            type="text"
            required
            placeholder="e.g. Chemistry Daily MCQ — 2026-07-10"
            value={form.title}
            onChange={e => setField('title', e.target.value)}
            className="admin-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={form.type} onChange={e => setField('type', e.target.value)} className="admin-input">
              {PAPER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Grade">
            <select value={form.grade} onChange={e => setField('grade', e.target.value)} className="admin-input">
              {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Subject">
          <select
            required
            value={form.subject_id}
            onChange={e => setField('subject_id', e.target.value)}
            className="admin-input"
          >
            <option value="">— select subject —</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name_si} ({s.id})</option>
            ))}
          </select>
        </Field>

        <Field label="Time Limit (seconds)">
          <input
            type="number"
            min={60}
            step={60}
            required
            value={form.time_seconds}
            onChange={e => setField('time_seconds', Number(e.target.value))}
            className="admin-input"
          />
        </Field>

        <Field label="Paper Date" hint="Available 00:00 – 23:59 SLST on this day">
          <input
            type="date"
            required
            value={form.date}
            onChange={e => setField('date', e.target.value)}
            className="admin-input"
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full py-2.5 rounded-sm bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 cursor-pointer border-none"
        >
          {submitting ? 'Creating…' : 'Create Draft'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-text-primary">
        {label}
        {hint && <span className="ml-1.5 font-normal text-text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
