'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { isApiError } from '@/services/api-client';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoggedIn } = useAuth();
  const { showToast } = useToast();

  const [mobile, setMobile]   = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (isLoggedIn) router.replace('/dashboard');
  }, [isLoggedIn, router]);

  const handleLogin = async () => {
    const m = mobile.trim();
    if (!m || !password) { showToast('Please enter your mobile and password', 'warning'); return; }

    setIsLoading(true);
    try {
      await login(m, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 401) {
        showToast('Incorrect mobile or password', 'error');
      } else {
        showToast('Could not sign in — ' + (isApiError(err) ? err.message : 'try again'), 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls = "w-full bg-white/5 border border-white/12 rounded-[12px] px-4 py-3 text-[13.5px] text-white placeholder:text-white/35 outline-none focus:border-white/40 transition-colors font-[inherit]";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-10"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1440 50%, #0d1b2e 100%)' }}
    >
      {/* Blobs */}
      <div className="animate-blob fixed -top-32 -left-20 w-96 h-96 rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b90f0, transparent 70%)', filter: 'blur(70px)' }} />
      <div className="animate-blob2 fixed -bottom-40 -right-10 w-80 h-80 rounded-full opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6cd4da, transparent 70%)', filter: 'blur(70px)' }} />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline justify-center mb-8">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold text-[18px]"
            style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}>M</div>
          <span className="text-white text-[20px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Miedvance</span>
        </Link>

        {/* Card */}
        <div className="rounded-[20px] p-7 border border-white/10" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
          <h1 className="text-[1.4rem] font-bold text-white mb-1 text-center" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Welcome back
          </h1>
          <p className="text-white/45 text-[12.5px] text-center mb-7">Sign in to continue your A/L prep</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">Mobile Number</label>
              <input type="tel" placeholder="07X XXX XXXX" value={mobile}
                onChange={(e) => setMobile(e.target.value)} autoFocus className={inputCls} />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Password</label>
                <Link href="/forgot-password" className="text-[11px] text-white/40 hover:text-white/70 no-underline transition-colors">
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} placeholder="Your password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className={inputCls + ' pr-10'} />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors bg-transparent border-none cursor-pointer text-[13px]">
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          <button onClick={handleLogin} disabled={isLoading}
            className="w-full mt-6 py-3.5 rounded-[12px] text-white font-semibold text-[14px] border-none cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)', boxShadow: '0 0 30px rgba(139,144,240,0.35)' }}>
            {isLoading ? 'Signing in…' : 'Sign In →'}
          </button>

          <p className="text-center text-[12px] text-white/40 mt-5">
            New to Miedvance?{' '}
            <Link href="/register" className="text-white/70 font-semibold no-underline hover:text-white transition-colors">
              Create a free account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
