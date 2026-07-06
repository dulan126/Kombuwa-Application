'use client';

import { Suspense, useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminService, type Subject } from '@/services/admin.service';
import { isApiError } from '@/services/api-client';

const GRADES = [
  { value: '12', label: 'Grade 12' },
  { value: '13', label: 'Grade 13' },
];

const TIME_DEFAULTS_MINS: Record<string, number> = { daily: 20, srp: 120 };

const TYPE_LABELS: Record<string, string> = {
  daily:     '📝 Daily MCQ',
  srp:       '⭐ SRP Paper',
  pastpaper: '📚 Past Paper',
};

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

// The SLST (UTC+5:30) calendar day an existing paper's available_from falls on.
function slstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().split('T')[0];
}

// Paper type and subject are fixed by the originating page (Daily MCQ / SRP
// Papers → subject card) and arrive as query params — they are constants here,
// not form fields.
function NewPaperForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paperType = searchParams.get('type') ?? '';
  const subjectId = searchParams.get('subject') ?? '';
  const isPast = paperType === 'pastpaper';
  const validParams = (paperType === 'daily' || paperType === 'srp' || isPast) && subjectId !== '';

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [dateError, setDateError] = useState('');

  // Creation only originates inside a subject view — bounce malformed links.
  useEffect(() => {
    if (!validParams) router.replace('/admin/papers/daily');
  }, [validParams, router]);

  useEffect(() => {
    adminService.listSubjects().then(setSubjects).catch(() => {});
  }, []);

  // Existing papers of this type+subject, by SLST day — for the one-per-day rule.
  const [takenDays, setTakenDays] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!validParams) return;
    adminService.listPapers({ subject_id: subjectId, type: paperType, limit: 200 })
      .then((res) => {
        const days = (res.papers ?? [])
          .map((p) => (p.available_from ? slstDay(p.available_from) : null))
          .filter((d): d is string => d !== null);
        setTakenDays(new Set(days));
      })
      .catch(() => {});
  }, [validParams, subjectId, paperType]);

  const isSRP = paperType === 'srp';
  const subjectName = subjects.find(s => s.id === subjectId)?.name_si ?? subjectId;
  const backHref = `/admin/papers/${paperType}?subject=${subjectId}`;

  const [form, setForm] = useState({
    title:        '',
    grade:        '13',
    time_minutes: TIME_DEFAULTS_MINS[paperType] ?? 20,
    date:         '',
    year:         String(new Date().getUTCFullYear()),
  });

  const autoTitle = useMemo(() => {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return '';
    if (isPast) return `${subject.name_si} Past Paper ${form.year}`;
    if (!form.date) return '';
    const typeLabel = isSRP ? 'SRP' : 'Daily';
    return `${subject.name_si} ${typeLabel} MCQ - ${form.date}`;
  }, [subjects, subjectId, isSRP, isPast, form.date, form.year]);

  useEffect(() => {
    if (!titleManuallyEdited && autoTitle) {
      setForm(prev => ({ ...prev, title: autoTitle }));
    }
  }, [autoTitle, titleManuallyEdited]);

  function handleDateChange(val: string) {
    setForm(prev => ({ ...prev, date: val }));
    if (isSRP && val) {
      const day = new Date(val).getUTCDay();
      setDateError(day !== 6 ? 'SRP papers must start on a Saturday' : '');
    } else {
      setDateError('');
    }
  }

  const dayTaken = !!form.date && takenDays.has(form.date);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title) {
      setError('Title is required.');
      return;
    }
    if (!isPast) {
      if (!form.date) { setError('Date is required.'); return; }
      if (dateError) { setError(dateError); return; }
      if (dayTaken) {
        setError(`A ${isSRP ? 'SRP' : 'Daily MCQ'} paper already exists for this subject on that day.`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      // Past papers have no schedule/timer — the backend normalises these fields.
      const availableFrom = isPast ? new Date().toISOString() : toSlstStart(form.date);
      const availableUntil = isPast
        ? undefined
        : isSRP
        ? new Date(`${nextDay(form.date)}T23:59:59+05:30`).toISOString()
        : toSlstEnd(form.date);

      const { id } = await adminService.createDraftPaper({
        type:            paperType,
        subject_id:      subjectId,
        grade:           isPast ? '' : form.grade,
        title:           form.title,
        time_seconds:    isPast ? 0 : form.time_minutes * 60,
        available_from:  availableFrom,
        available_until: availableUntil,
      });
      router.push(`/admin/papers/${id}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to create paper');
      setSubmitting(false);
    }
  }

  if (!validParams) return null;

  const dateMin = isSRP ? nextSaturdayISO() : todayISO();

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href={backHref} className="text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors">
          ← Back to {isPast ? 'Past Papers' : isSRP ? 'SRP Papers' : 'Daily MCQ'}
        </Link>
        <h1 className="mt-3 text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          New {isPast ? 'Past Paper' : 'Paper'}
        </h1>
        <p className="text-text-muted text-[12.5px]">
          Creates a draft. {isPast ? 'Add MCQs and reference PDFs' : 'Add questions'} in the builder.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface rounded-base border border-border-dim p-6 flex flex-col gap-4">
        {error && (
          <div className="p-3 rounded-sm bg-danger/10 border border-danger/20 text-danger text-[12.5px]">
            {error}
          </div>
        )}

        {/* Fixed context — type and subject come from the originating page */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-brand/10 text-brand border border-brand/20">
            {TYPE_LABELS[paperType]}
          </span>
          <span className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-dark text-text-primary border border-border-dim">
            {subjectName} ({subjectId})
          </span>
        </div>

        {!isPast && (
          <Field label="Grade">
            <select
              value={form.grade}
              onChange={e => setForm(prev => ({ ...prev, grade: e.target.value }))}
              className="admin-input"
            >
              {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </Field>
        )}

        {isPast ? (
          <Field label="Exam Year" hint="The year this past paper is from">
            <input
              type="number"
              min={2000}
              max={2100}
              step={1}
              required
              value={form.year}
              onChange={e => setForm(prev => ({ ...prev, year: e.target.value }))}
              className="admin-input"
            />
          </Field>
        ) : (
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
            {dayTaken && !dateError && (
              <p className="text-[11.5px] text-danger mt-0.5">
                A {isSRP ? 'SRP' : 'Daily MCQ'} paper already exists for this subject on this day.
              </p>
            )}
            {isSRP && form.date && !dateError && !dayTaken && (
              <p className="text-[11.5px] text-text-muted mt-0.5">
                Window: {form.date} 00:00 → {nextDay(form.date)} 23:59 SLST
              </p>
            )}
          </Field>
        )}

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

        {!isPast && (
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
        )}

        <button
          type="submit"
          disabled={submitting || (!isPast && dayTaken)}
          className="mt-2 w-full py-2.5 rounded-sm bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 cursor-pointer border-none"
        >
          {submitting ? 'Creating…' : 'Create Draft'}
        </button>
      </form>
    </div>
  );
}

export default function NewPaperPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      }
    >
      <NewPaperForm />
    </Suspense>
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
