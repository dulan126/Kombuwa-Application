'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/(app)/forum', label: 'Forum' },
  { href: '/(app)/rankings', label: 'Rankings' },
];

export function HomeNavbar() {
  const [open, setOpen] = useState(false);
  const { user, isLoggedIn, logout } = useAuth();
  const router = useRouter();

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <header className="sticky top-0 z-50 glass border-b border-border-dim">
      <div className="max-w-[1200px] mx-auto flex items-center h-[60px] px-5 gap-4">
        {/* Hamburger */}
        <button
          className="w-8 h-8 flex flex-col justify-center items-center gap-[5px] cursor-pointer bg-transparent border-none"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          <span
            className="block h-[2px] bg-text-primary transition-all duration-200"
            style={{ width: open ? '18px' : '20px', transform: open ? 'rotate(45deg) translateY(7px)' : 'none' }}
          />
          <span
            className="block h-[2px] bg-text-primary transition-all duration-200"
            style={{ width: '14px', opacity: open ? 0 : 1 }}
          />
          <span
            className="block h-[2px] bg-text-primary transition-all duration-200"
            style={{ width: open ? '18px' : '20px', transform: open ? 'rotate(-45deg) translateY(-7px)' : 'none' }}
          />
        </button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <div className="w-8 h-8 rounded-[9px] gradient-brand flex items-center justify-center text-white font-bold text-[14px]">
            M
          </div>
          <span className="text-[17px] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Mied<span className="text-gold">vance</span>
          </span>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-muted hidden sm:block">{user?.name}</span>
            <button
              onClick={logout}
              className="text-[12px] text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
            >
              Logout
            </button>
            <div className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-[13px]">
              {initial}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/register"
              className="px-4 py-1.5 rounded-full text-[12.5px] font-semibold bg-gold text-white no-underline hover:bg-gold-dark transition-colors"
            >
              Register Free
            </Link>
            <button
              onClick={() => router.push('/register')}
              className="px-3 py-1.5 rounded-full text-[12.5px] font-medium border border-border-dim text-text-muted bg-transparent cursor-pointer hover:border-gold hover:text-gold transition-colors"
            >
              Login
            </button>
          </div>
        )}
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border-dim bg-white px-5 py-3 flex flex-col gap-1 animate-fade-in">
          {isLoggedIn && (
            <div className="text-[12px] text-text-muted py-1 border-b border-border-dim mb-1">
              Signed in as <strong className="text-text-primary">{user?.name}</strong>
            </div>
          )}
          <Link href="/" className="py-2 text-[13px] text-text-primary no-underline" onClick={() => setOpen(false)}>Home</Link>
          <Link href="/forum" className="py-2 text-[13px] text-text-primary no-underline" onClick={() => setOpen(false)}>Forum</Link>
          <Link href="/rankings" className="py-2 text-[13px] text-text-primary no-underline" onClick={() => setOpen(false)}>Rankings</Link>
          {isLoggedIn && (
            <button
              className="py-2 text-[13px] text-text-muted text-left bg-transparent border-none cursor-pointer"
              onClick={() => { logout(); setOpen(false); }}
            >
              Logout
            </button>
          )}
        </div>
      )}
    </header>
  );
}
