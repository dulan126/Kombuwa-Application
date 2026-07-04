'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminService, type Subject } from '@/services/admin.service';
import { isApiError } from '@/services/api-client';

const PAPER_TYPES = [
  { value: 'daily', label: 'Daily MCQ (10 questions)' },
  { value: 'srp',   label: 'SRP Paper (50 questions)' },
];

const GRADES = [
  { value: '12', label: 'Grade 12' },
  { value: '13', label: 'Grade 13' },
];

const TIME_DEFAULTS_MINS: Record<string, number> = { daily: 20, srp: 120 };

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function nextSaturdayISO(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const daysUntilSat = day === 6 ? 7 : (6 - day + 7) % 7 || 7;
  const sat = new Date(d);
  sat.setUTCDate(d.getUTCDate() + daysUntilSat);
  return sat.toISOString().split('T')[0];
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

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
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    adminService.listSubjects().then(setSubjects).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    title:        '',
    type:         'daily',
    subject_id:   '',
    grade:        '13',
    time_minutes: 20,
    date:         '',
  });

  const autoTitle = useMemo(() => {
    const subject = subjects.find(s => s.id === form.subject_id);
    if (!subject || !form.date) return '';
    const typeLabel = form.type === 'srp' ? 'SRP' : 'Daily';
    return `${subject.name_si} ${typeLabel} MCQ - ${form.date}`;
  }, [subjects, form.subject_id, form.type, form.date]);

  useEffect(() => {
    if (!titleManuallyEdited && autoTitle) {
      setForm(prev => ({ ...prev, title: autoTitle }));
    }
  }, [autoTitle, titleManuallyEdited]);

  function handleTypeChange(t: string) {
    setForm(prev => ({ ...prev, type: t, time_minutes: TIME_DEFAULTS_MINS[t] ?? 20 }));
    setDateError('');
  }

  function handleDateChange(val: string) {
    setForm(prev => ({ ...prev, date: val }));
    if (form.type === 'srp' && val) {
      const day = new Date(val).getUTCDay();
      setDateError(day !== 6 ? 'SRP papers must start on a Saturday' : '');
    } else {
      setDateError('');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title || !form.subject_id || !form.date) {
      setError('Title, subject, and date are required.');
      return;
    }
    if (dateError) {
      setError(dateError);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const availableFrom = toSlstStart(form.date);
      const availableUntil = form.type === 'srp'
        ? new Date(`${nextDay(form.date)}T23:59:59+05:30`).toISOString()
        : toSlstEnd(form.date);

      const { id } = await adminService.createDraftPaper({
        type:            form.type,
        subject_id:      form.subject_id,
        grade:           form.grade,
        title:           form.title,
        time_seconds:    form.time_minutes * 60,
        available_from:  availableFrom,
        available_until: availableUntil,
      });
      router.push(`/admin/papers/${id}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to create paper');
      setSubmitting(false);
    }
  }

  const isSRP = form.type === 'srp';
  const dateMin = isSRP ? nextSaturdayISO() : todayISO();

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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select
              value={form.type}
              onChange={e => handleTypeChange(e.target.value)}
              className="admin-input"
            >
              {PAPER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Grade">
            <select
              value={form.grade}
              onChange={e => setForm(prev => ({ ...prev, grade: e.target.value }))}
              className="admin-input"
            >
              {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Subject">
          <select
            required
            value={form.subject_id}
            onChange={e => setForm(prev => ({ ...prev, subject_id: e.target.value }))}
            className="admin-input"
          >
            <option value="">— select subject —</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name_si} ({s.id})</option>
            ))}
          </select>
        </Field>

        <Field
          label={isSRP ? 'Start Date (Saturday only)' : 'Paper Date'}
          hint={isSRP ? 'Saturdays only — runs until Sunday 23:59 SLST' : 'Available 00:00 – 23:59 SLST on this day'}
        >
          <input
            type="date"
            required
            min={dateMin}
            step={isSRP ? 7 : undefined}
            value={form.date}
            onChange={e => handleDateChange(e.target.value)}
            className="admin-input"
          />
          {dateError && (
            <p className="text-[11.5px] text-danger mt-0.5">{dateError}</p>
          )}
          {isSRP && form.date && !dateError && (
            <p className="text-[11.5px] text-text-muted mt-0.5">
              Window: {form.date} 00:00 → {nextDay(form.date)} 23:59 SLST
            </p>
          )}
        </Field>

        <Field label="Title">
          <input
            type="text"
            required
            placeholder="Auto-generated from selections above"
            value={form.title}
            onChange={e => {
              const val = e.target.value;
              setTitleManuallyEdited(!!val);
              setForm(prev => ({ ...prev, title: val }));
            }}
            className="admin-input"
          />
        </Field>

        <Field label="Time Limit (minutes)" hint="20 min for Daily · 120 min for SRP">
          <input
            type="number"
            min={1}
            step={1}
            required
            value={form.time_minutes}
            onChange={e => setForm(prev => ({ ...prev, time_minutes: Number(e.target.value) }))}
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
