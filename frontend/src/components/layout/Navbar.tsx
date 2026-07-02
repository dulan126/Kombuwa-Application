'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { STREAMS } from '@/lib/constants';
import { Button } from '@/components/ui/Button';

// ─── Navigation Links ────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '/', label: 'මුල් පිටුව', id: 'home', requiresAuth: false },
  { href: '/dashboard', label: '📋 Dashboard', id: 'dashboard', requiresAuth: true },
  { href: '/marking-scheme', label: '📖 ලකුණු ක්‍රමය', id: 'marking', requiresAuth: true },
  { href: '/rankings', label: '🏆 ශ්‍රේණිගත', id: 'rankings', requiresAuth: true },
  { href: '/forum', label: '💬 ප්‍රශ්නෝත්තර', id: 'qa', requiresAuth: true },
  { href: '/past-papers', label: '📚 Past Papers', id: 'pastpapers', requiresAuth: true },
];

// ─── Navbar Component ────────────────────────────────────────────────────────

export function Navbar() {
  const pathname = usePathname();
  const { user, isLoggedIn, isDemoMode, logout, demoLogin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const router = useRouter();
  const stream = user?.stream ? STREAMS[user.stream] : null;

  const handleDemoLogin = async () => {
    await demoLogin('Demo Student', 'phy', '12', 'Colombo');
    router.push('/dashboard');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] glass border-b border-gold-border flex items-center px-6 h-[58px] gap-0">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 cursor-pointer mr-5 shrink-0 no-underline">
        <div className="w-8 h-8 rounded-[7px] gradient-gold flex items-center justify-center font-bold text-[15px] text-white">
          M
        </div>
        <span className="text-[17px] font-bold text-gold">MIEDVANCE</span>
      </Link>

      {/* Desktop Nav Links */}
      <div className="hidden md:flex gap-0 flex-1 overflow-x-auto">
        {NAV_LINKS.map((link) => {
          if (link.requiresAuth && !isLoggedIn) return null;
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.id}
              href={link.requiresAuth && !isLoggedIn ? '/' : link.href}
              className={cn(
                'px-2.5 h-[58px] flex items-center text-[11.5px] text-text-muted cursor-pointer border-b-2 border-transparent transition-all duration-150 whitespace-nowrap no-underline',
                'hover:text-text-primary',
                isActive && 'text-text-primary border-b-gold',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {isLoggedIn && stream && (
          <span className="text-[11px] text-text-muted bg-surface border border-border-dim px-3 py-1 rounded-full whitespace-nowrap">
            {stream.icon} {user?.grade}ශ්‍රේ · {stream.name}
            {isDemoMode && ' · Demo'}
          </span>
        )}
        {isLoggedIn ? (
          <Button variant="outline" size="sm" onClick={logout}>
            Logout
          </Button>
        ) : (
          <div className="flex gap-2">
            <Link href="/register">
              <Button variant="primary" size="sm">ලියාපදිංචිය</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleDemoLogin}>
              Demo
            </Button>
          </div>
        )}

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden bg-transparent border-none text-text-muted text-xl cursor-pointer"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-[58px] left-0 right-0 bg-dark-2 border-b border-border-dim p-4 flex flex-col gap-1 md:hidden animate-fade-in">
          {NAV_LINKS.map((link) => {
            if (link.requiresAuth && !isLoggedIn) return null;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.id}
                href={link.href}
                className={cn(
                  'px-3 py-2.5 rounded-[var(--radius-sm)] text-sm text-text-muted no-underline transition-colors',
                  'hover:bg-surface hover:text-text-primary',
                  isActive && 'bg-gold-bg text-gold',
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
