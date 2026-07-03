'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { subjectsService, type Stream, type Subject } from '@/services/subjects.service';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: string;
  href: string;
}

const STORAGE_KEY = 'student-sidebar-collapsed';

export function SubjectSidebar({ subjectId }: { subjectId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoggedIn, logout } = useAuth();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [streamInfo, setStreamInfo] = useState<Stream | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  function toggle() {
    setCollapsed(prev => {
      localStorage.setItem(STORAGE_KEY, String(!prev));
      return !prev;
    });
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const [subjects, streams] = await Promise.all([
          subjectsService.getSubjects(),
          subjectsService.getStreams(),
        ]);
        if (cancelled) return;
        const found = subjects.find((s) => s.id === subjectId) ?? null;
        setSubject(found);
        const userStream = streams.find((s) => s.id === user!.stream) ?? null;
        setStreamInfo(userStream);
      } catch {
        // leave null — sidebar degrades gracefully
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, subjectId]);

  const base = `/subject/${subjectId}`;

  const navItems: NavItem[] = [
    { label: 'Overview',        icon: '🏠', href: base },
    { label: 'Daily MCQ',       icon: '📝', href: `${base}/exam?type=daily` },
    { label: 'Special Paper',   icon: '⭐', href: `${base}/exam?type=srp` },
    { label: 'Past Papers',     icon: '📚', href: `${base}/past-papers` },
    { label: 'Leaderboard',     icon: '🏆', href: `${base}/leaderboard` },
    { label: 'Marking Schemes', icon: '📖', href: `${base}/marking-schemes` },
    { label: 'Forum',           icon: '💬', href: '/forum' },
  ];

  const isActive = (href: string) => {
    if (href === base) return pathname === base;
    const [hrefPath, hrefQuery] = href.split('?');
    if (!pathname.startsWith(hrefPath)) return false;
    if (!hrefQuery) return true;
    const hrefParams = new URLSearchParams(hrefQuery);
    for (const [key, val] of hrefParams.entries()) {
      if (searchParams.get(key) !== val) return false;
    }
    return true;
  };

  const streamColor = streamInfo?.color ?? '#8b90f0';
  const streamIcon  = streamInfo?.icon  ?? '📚';
  const streamName  = streamInfo?.name  ?? 'Subject';
  const subjectName = subject?.name_si  ?? subjectId;
  const initial     = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col h-screen sticky top-0 bg-white border-r border-border-dim overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-65',
      )}
    >
      {/* Back button / brand row */}
      <div className={cn('p-4 border-b border-border-dim flex items-center justify-between', collapsed && 'justify-center px-2')}>
        {collapsed ? (
          <Link
            href="/dashboard"
            className="text-text-muted hover:text-text-primary no-underline transition-colors text-[14px]"
            title="Back to Dashboard"
          >
            ←
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors"
          >
            ← Back to Dashboard
          </Link>
        )}
      </div>

      {/* Subject card */}
      {!collapsed && (
        <div className="p-4 border-b border-border-dim">
          <div
            className="rounded-[12px] p-4"
            style={{ background: `${streamColor}12` }}
          >
            <div className="text-2xl mb-2">{streamIcon}</div>
            <div className="text-[13px] font-bold text-text-primary leading-snug">
              {subjectName}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {streamName}
            </div>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="flex justify-center py-3 border-b border-border-dim" title={subjectName}>
          <span className="text-2xl">{streamIcon}</span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-hidden">
        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={cn(
            'flex items-center py-1.75 px-2 rounded-sm cursor-pointer text-[13px] transition-all mb-1 w-full bg-transparent border-none text-text-muted hover:text-text-primary hover:bg-dark font-[inherit]',
            collapsed ? 'justify-center' : 'justify-end pr-3',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>

        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              'sidebar-nav-item',
              isActive(item.href) && 'active',
              collapsed && 'justify-center px-2',
            )}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && isActive(item.href) && (
              <span
                className="ml-auto w-1.5 h-1.5 rounded-full"
                style={{ background: streamColor }}
              />
            )}
          </Link>
        ))}
      </nav>

      {/* User profile */}
      <div className={cn('p-4 border-t border-border-dim', collapsed && 'flex flex-col items-center gap-2 px-2')}>
        {isLoggedIn && user ? (
          collapsed ? (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0"
              style={{ background: streamColor }}
              title={`${user.name} · Grade ${user.grade}`}
            >
              {initial}
            </div>
          ) : (
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
          )
        ) : (
          !collapsed && (
            <Link href="/register" className="text-[12px] text-gold no-underline font-semibold">
              Sign in →
            </Link>
          )
        )}
      </div>
    </aside>
  );
}
