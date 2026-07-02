'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { STREAMS } from '@/lib/constants';
import type { Stream } from '@/types/auth';

interface NavItem {
  label: string;
  icon: string;
  href: string;
}

function getSubjectInfo(subjectId: string) {
  for (const [key, stream] of Object.entries(STREAMS) as [Stream, typeof STREAMS.phy][]) {
    const subject = stream.subjects.find((s) => s.id === subjectId);
    if (subject) return { subject, stream, key };
  }
  return null;
}

export function SubjectSidebar({ subjectId }: { subjectId: string }) {
  const pathname = usePathname();
  const { user, isLoggedIn, logout } = useAuth();

  const info = getSubjectInfo(subjectId);
  const base = `/subject/${subjectId}`;

  const navItems: NavItem[] = [
    { label: 'Overview', icon: '🏠', href: base },
    { label: 'Daily MCQ', icon: '📝', href: `${base}/exam?type=daily` },
    { label: 'Special Paper', icon: '⭐', href: `${base}/exam?type=srp` },
    { label: 'Past Papers', icon: '📚', href: `${base}/past-papers` },
    { label: 'Leaderboard', icon: '🏆', href: `${base}/leaderboard` },
    { label: 'Marking Schemes', icon: '📖', href: `${base}/marking-schemes` },
    { label: 'Forum', icon: '💬', href: '/forum' },
  ];

  const isActive = (href: string) => {
    if (href === base) return pathname === base;
    return pathname.startsWith(href.split('?')[0]);
  };

  const streamColor = info?.stream?.color ?? '#8b90f0';
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <aside className="w-65 shrink-0 flex flex-col h-screen sticky top-0 bg-white border-r border-border-dim overflow-y-auto">
      {/* Back button */}
      <div className="p-4 border-b border-border-dim">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Subject card */}
      <div className="p-4 border-b border-border-dim">
        <div
          className="rounded-[12px] p-4"
          style={{ background: `${streamColor}12` }}
        >
          <div className="text-2xl mb-2">{info?.stream?.icon ?? '📚'}</div>
          <div className="text-[13px] font-bold text-text-primary leading-snug">
            {info?.subject?.n ?? subjectId}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {info?.stream?.name ?? 'Subject'}
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 flex flex-col gap-0.5">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`sidebar-nav-item ${isActive(item.href) ? 'active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {isActive(item.href) && (
              <span
                className="ml-auto w-1.5 h-1.5 rounded-full"
                style={{ background: streamColor }}
              />
            )}
          </Link>
        ))}
      </nav>

      {/* User profile */}
      <div className="p-4 border-t border-border-dim">
        {isLoggedIn && user ? (
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0"
              style={{ background: streamColor }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-text-primary truncate">{user.name}</div>
              <div className="text-[11px] text-text-muted">Grade {user.grade}</div>
            </div>
            <button
              onClick={logout}
              className="text-[11px] text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer"
              title="Logout"
            >
              ↪
            </button>
          </div>
        ) : (
          <Link href="/register" className="text-[12px] text-gold no-underline font-semibold">
            Sign in →
          </Link>
        )}
      </div>
    </aside>
  );
}
