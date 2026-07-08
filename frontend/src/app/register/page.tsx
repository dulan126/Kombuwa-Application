'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { DISTRICTS } from '@/lib/constants';
import { subjectsService, type Stream as ApiStream } from '@/services/subjects.service';
import { districtMap } from '@/lib/utils';
import { isApiError } from '@/services/api-client';
import type { Stream, Grade } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  mobile:   string;
  name:     string;
  email:    string;
  district: string;
  examYear: string;
  stream:   Stream | '';
  grade:    Grade;
  password: string;
  confirm:  string;
}

type Step = 'phone' | 'details' | 'password' | 'otp';

const DISTRICT_OPTIONS = DISTRICTS.map((d) => ({
  value: d.si,
  label: d.en.charAt(0).toUpperCase() + d.en.slice(1),
}));

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string }[] = [
  { key: 'phone',    label: 'Phone'    },
  { key: 'details',  label: 'Details'  },
  { key: 'password', label: 'Password' },
  { key: 'otp',      label: 'Verify'   },
];

function ProgressBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-0 mb-8 w-full max-w-[340px] mx-auto">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${
                i < idx  ? 'bg-success text-white' :
                i === idx ? 'text-white shadow-[0_0_16px_rgba(139,144,240,0.5)]' :
                            'bg-border-dim text-text-muted'
              }`}
              style={i === idx ? { background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' } : undefined}
            >
              {i < idx ? '✓' : i + 1}
            </div>
            <span className={`text-[9.5px] font-medium ${i <= idx ? 'text-gold' : 'text-text-muted'}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-1 mb-4 transition-all duration-500 ${i < idx ? 'bg-success' : 'bg-border-dim'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Field components ────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-danger normal-case tracking-normal">*</span>}
        {hint && <span className="text-text-muted font-normal normal-case tracking-normal ml-1">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-dark border border-border-dim rounded-[10px] px-3.5 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-gold transition-colors font-[inherit]";

// ─── Password strength ───────────────────────────────────────────────────────

function getStrength(pw: string): { level: number; label: string; color: string } {
  if (!pw) return { level: 0, label: '', color: 'bg-border-dim' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { level: 0, label: '',        color: 'bg-border-dim' },
    { level: 1, label: 'Weak',    color: 'bg-danger'     },
    { level: 2, label: 'Fair',    color: 'bg-warning'    },
    { level: 3, label: 'Good',    color: 'bg-success/70' },
    { level: 4, label: 'Strong',  color: 'bg-success'    },
  ];
  return map[s];
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router  = useRouter();
  const { register, verifyOTP, isLoggedIn } = useAuth();
  const { showToast } = useToast();

  const [step, setStep]       = useState<Step>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [streams, setStreams]  = useState<ApiStream[]>([]);
  const [form, setForm]       = useState<FormData>({
    mobile: '', name: '', email: '', district: 'කොළඹ',
    examYear: '2026', stream: '', grade: '12',
    password: '', confirm: '',
  });
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (isLoggedIn) router.replace('/dashboard');
  }, [isLoggedIn, router]);

  useEffect(() => {
    subjectsService.getStreams()
      .then((data) => setStreams(data.sort((a, b) => a.sort_order - b.sort_order)))
      .catch(() => {});
  }, []);

  const set = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handlePhoneNext() {
    const m = form.mobile.trim();
    if (!m) { showToast('Please enter your mobile number', 'warning'); return; }
    if (!/^(?:0|\+94)7[0-9]{8}$/.test(m)) {
      showToast('Use format 07X XXX XXXX or +94 7XX XXX XXX', 'warning'); return;
    }
    setStep('details');
  }

  function handleDetailsNext() {
    if (!form.name.trim())    { showToast('Please enter your full name', 'warning'); return; }
    if (!form.stream)         { showToast('Please select your A/L stream', 'warning'); return; }
    setStep('password');
  }

  async function handleCreateAccount() {
    if (form.password.length < 8) { showToast('Password must be at least 8 characters', 'warning'); return; }
    if (form.password !== form.confirm) { showToast('Passwords do not match', 'warning'); return; }

    setIsLoading(true);
    try {
      const result = await register({
        mobile:     form.mobile.trim(),
        name:       form.name.trim(),
        password:   form.password,
        stream:     form.stream as Stream,
        grade:      form.grade,
        district:   districtMap(form.district),
        exam_year:  parseInt(form.examYear),
      });
      if (result.needsOTP) {
        setStep('otp');
        showToast(`Verification code sent to ${form.mobile.trim()}`, 'success');
      } else {
        showToast('Welcome to Miedvance! 🎉', 'success');
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 409) {
        showToast('This mobile number is already registered', 'warning');
        setStep('phone');
      } else {
        showToast('Something went wrong — ' + (isApiError(err) ? err.message : 'please try again'), 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (otpCode.length !== 6) { showToast('Enter the 6-digit code from your SMS', 'warning'); return; }
    setIsLoading(true);
    try {
      await verifyOTP(form.mobile.trim(), otpCode, 'register');
      showToast('Welcome to Miedvance! 🎉', 'success');
      // verifyOTP logs the user in; the redirect effect above navigates once auth
      // state flips. Keep loading until then — no second push racing it.
    } catch (err: unknown) {
      setIsLoading(false);
      showToast('Incorrect code — ' + (isApiError(err) ? err.message : 'please try again'), 'error');
    }
  }

  const strength = getStrength(form.password);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1440 50%, #0d1b2e 100%)' }}
    >
      {/* ── Left branding ── */}
      <div className="hidden lg:flex flex-col justify-center px-14 w-[380px] shrink-0 relative overflow-hidden">
        {/* Blob */}
        <div className="animate-blob absolute -top-20 -left-20 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #8b90f0, transparent 70%)', filter: 'blur(60px)' }} />

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2.5 no-underline mb-12">
            <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold text-[18px]"
              style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}>M</div>
            <span className="text-white text-[20px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Miedvance</span>
          </Link>
          <h2 className="text-white text-[1.8rem] font-bold leading-tight mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Your A/L journey<br />starts here.
          </h2>
          <p className="text-white/50 text-[13px] leading-relaxed mb-8">
            Join 42,000+ students preparing for A/L exams with daily MCQ, SRP papers, and island-wide rankings.
          </p>
          {['Free forever — no credit card', 'Daily MCQ with instant scores', 'Island-wide leaderboards'].map((t) => (
            <div key={t} className="flex items-center gap-2.5 mb-3">
              <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center text-success text-[11px]">✓</div>
              <span className="text-white/65 text-[12.5px]">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[460px]">
          {/* Top logo (mobile) */}
          <Link href="/" className="lg:hidden flex items-center gap-2 no-underline mb-6 justify-center">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}>M</div>
            <span className="text-white font-bold text-[18px]">Miedvance</span>
          </Link>

          <ProgressBar current={step} />

          <div className="bg-surface rounded-[20px] shadow-2xl border border-white/8 p-7 animate-scale-in">

            {/* ─── STEP: PHONE ─────────────────────────────────────────────── */}
            {step === 'phone' && (
              <div>
                <h1 className="text-[1.3rem] font-bold text-text-primary mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Enter your mobile number
                </h1>
                <p className="text-[12.5px] text-text-muted mb-6">
                  We&apos;ll send a verification code to confirm your number.
                </p>

                <Field label="Mobile Number" required>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted font-semibold">+94</span>
                    <input
                      type="tel"
                      placeholder="7XX XXX XXX"
                      value={form.mobile.startsWith('+94') ? form.mobile.slice(3) : form.mobile.startsWith('0') ? form.mobile.slice(1) : form.mobile}
                      onChange={(e) => set('mobile', '+94' + e.target.value.replace(/\D/g, '').slice(0, 9))}
                      autoFocus
                      className={inputCls + ' pl-12'}
                    />
                  </div>
                </Field>

                <div className="mt-3 px-3 py-2.5 bg-gold/8 border border-gold/20 rounded-[8px]">
                  <p className="text-[11.5px] text-text-muted leading-relaxed">
                    📱 We&apos;ll send a one-time code via SMS to verify your Sri Lankan number.
                  </p>
                </div>

                <button
                  onClick={handlePhoneNext}
                  className="w-full mt-6 py-3.5 rounded-[12px] text-white font-semibold text-[14px] border-none cursor-pointer transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}
                >
                  Continue →
                </button>

                <p className="text-center text-[12px] text-text-muted mt-4">
                  Already have an account?{' '}
                  <Link href="/login" className="text-gold font-semibold no-underline hover:text-gold-dark transition-colors">
                    Sign in
                  </Link>
                </p>
              </div>
            )}

            {/* ─── STEP: DETAILS ───────────────────────────────────────────── */}
            {step === 'details' && (
              <div>
                <h1 className="text-[1.3rem] font-bold text-text-primary mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Tell us about yourself
                </h1>
                <p className="text-[12.5px] text-text-muted mb-6">
                  This helps us personalise your exam prep experience.
                </p>

                <div className="flex flex-col gap-4">
                  {/* Name + Email */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Full Name" required>
                      <input type="text" placeholder="e.g. Kavitha Perera" value={form.name}
                        onChange={(e) => set('name', e.target.value)} className={inputCls} autoFocus />
                    </Field>
                    <Field label="Email" hint="(optional)">
                      <input type="email" placeholder="you@example.com" value={form.email}
                        onChange={(e) => set('email', e.target.value)} className={inputCls} />
                    </Field>
                  </div>

                  {/* Grade */}
                  <Field label="Grade" required>
                    <div className="grid grid-cols-2 gap-2">
                      {(['12', '13'] as Grade[]).map((g) => (
                        <button key={g} onClick={() => set('grade', g)}
                          className={`py-2.5 rounded-[10px] text-[13px] font-semibold border-2 cursor-pointer transition-all font-[inherit] ${
                            form.grade === g ? 'border-gold bg-gold text-white' : 'border-border-dim bg-dark text-text-primary hover:border-gold'
                          }`}>
                          Grade {g}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* Stream */}
                  <Field label="A/L Stream" required>
                    {streams.length === 0 ? (
                      <div className="text-[12px] text-text-muted py-2">Loading streams…</div>
                    ) : (
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(streams.length, 5)}, 1fr)` }}>
                        {streams.map((s) => {
                          const sel = form.stream === s.id;
                          return (
                            <button key={s.id} onClick={() => set('stream', s.id)}
                              className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-[10px] border-2 cursor-pointer transition-all font-[inherit]"
                              style={{
                                borderColor: sel ? s.color : 'var(--color-border-dim)',
                                background: sel ? s.color + '20' : 'var(--color-dark)',
                              }}
                            >
                              <span className="text-[20px]">{s.icon}</span>
                              <span className="text-[9.5px] font-semibold leading-tight text-center"
                                style={{ color: sel ? s.color : 'var(--color-text-muted)' }}>
                                {s.name.split(' ')[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Field>

                  {/* District + Year */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="District">
                      <select value={form.district} onChange={(e) => set('district', e.target.value)}
                        className={inputCls + ' cursor-pointer'}>
                        {DISTRICT_OPTIONS.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="A/L Year">
                      <select value={form.examYear} onChange={(e) => set('examYear', e.target.value)}
                        className={inputCls + ' cursor-pointer'}>
                        {['2026', '2027'].map((y) => <option key={y} value={y}>{y} A/L</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setStep('phone')}
                    className="px-5 py-3 rounded-[12px] border border-border-dim text-text-muted text-[13px] font-medium cursor-pointer bg-transparent hover:border-gold hover:text-gold transition-all font-[inherit]">
                    ← Back
                  </button>
                  <button onClick={handleDetailsNext}
                    className="flex-1 py-3 rounded-[12px] text-white font-semibold text-[14px] border-none cursor-pointer transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}>
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP: PASSWORD ──────────────────────────────────────────── */}
            {step === 'password' && (
              <div>
                <h1 className="text-[1.3rem] font-bold text-text-primary mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Create your password
                </h1>
                <p className="text-[12.5px] text-text-muted mb-6">
                  Choose a strong password for your account.
                </p>

                <div className="flex flex-col gap-4">
                  <Field label="Password" required>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        value={form.password}
                        onChange={(e) => set('password', e.target.value)}
                        className={inputCls + ' pr-10'}
                        autoFocus
                      />
                      <button type="button" onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer text-[13px]">
                        {showPw ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {form.password && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1,2,3,4].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : 'bg-border-dim'}`} />
                          ))}
                        </div>
                        {strength.label && <p className="text-[10.5px] text-text-muted">{strength.label} password</p>}
                      </div>
                    )}
                  </Field>

                  <Field label="Confirm Password" required>
                    <input
                      type={showPw ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      value={form.confirm}
                      onChange={(e) => set('confirm', e.target.value)}
                      className={inputCls + (form.confirm && form.confirm !== form.password ? ' border-danger' : '')}
                    />
                    {form.confirm && form.confirm !== form.password && (
                      <p className="text-[11px] text-danger mt-1">Passwords do not match</p>
                    )}
                  </Field>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setStep('details')}
                    className="px-5 py-3 rounded-[12px] border border-border-dim text-text-muted text-[13px] font-medium cursor-pointer bg-transparent hover:border-gold hover:text-gold transition-all font-[inherit]">
                    ← Back
                  </button>
                  <button onClick={handleCreateAccount} disabled={isLoading}
                    className="flex-1 py-3 rounded-[12px] text-white font-semibold text-[14px] border-none cursor-pointer transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}>
                    {isLoading ? 'Creating account…' : 'Create Account →'}
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP: OTP ───────────────────────────────────────────────── */}
            {step === 'otp' && (
              <div>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-[14px] flex items-center justify-center text-2xl bg-gold/10 border border-gold/20">
                    📱
                  </div>
                </div>
                <h1 className="text-[1.3rem] font-bold text-text-primary text-center mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Verify your number
                </h1>
                <p className="text-[12.5px] text-text-muted text-center mb-6">
                  We sent a 6-digit code to{' '}
                  <span className="font-semibold text-text-primary">{form.mobile}</span>
                </p>

                <Field label="Verification Code">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    className={inputCls + ' text-center text-[1.8rem] tracking-[0.6rem] py-4 font-bold'}
                  />
                </Field>

                <button onClick={handleVerifyOTP} disabled={isLoading || otpCode.length !== 6}
                  className="w-full mt-5 py-3.5 rounded-[12px] text-white font-semibold text-[14px] border-none cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}>
                  {isLoading ? 'Verifying…' : 'Verify & Enter →'}
                </button>

                <button onClick={() => setStep('password')}
                  className="w-full mt-2 py-2 text-[12px] text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer">
                  ← Edit details
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
