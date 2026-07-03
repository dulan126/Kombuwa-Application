'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, ClipboardCheck, Star, BookOpen, Trophy,
  CheckCircle2, MessageCircle, ArrowLeft, LogOut,
  ChevronLeft, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { subjectsService, type Stream, type Subject } from '@/services/subjects.service';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  Icon: LucideIcon;
  color: string;
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
        setSubject(subjects.find((s) => s.id === subjectId) ?? null);
        setStreamInfo(streams.find((s) => s.id === user!.stream) ?? null);
      } catch {
        // degrade gracefully
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, subjectId]);

  const base = `/subject/${subjectId}`;
  const streamColor = streamInfo?.color ?? '#8b90f0';
  const subjectName = subject?.name_si ?? subjectId;
  const streamName  = streamInfo?.name  ?? 'Subject';
  const initial     = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  const navItems: NavItem[] = [
    { label: 'Overview',        Icon: LayoutDashboard, color: '#8b90f0', href: base },
    { label: 'Daily MCQ',       Icon: ClipboardCheck,  color: '#4F7FE8', href: `${base}/exam?type=daily` },
    { label: 'Special Paper',   Icon: Star,            color: '#F59E0B', href: `${base}/exam?type=srp` },
    { label: 'Past Papers',     Icon: BookOpen,        color: '#10B981', href: `${base}/past-papers` },
    { label: 'Leaderboard',     Icon: Trophy,          color: '#EAB308', href: `${base}/leaderboard` },
    { label: 'Marking Schemes', Icon: CheckCircle2,    color: '#14B8A6', href: `${base}/marking-schemes` },
    { label: 'Forum',           Icon: MessageCircle,   color: '#A78BFA', href: '/forum' },
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

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col h-screen sticky top-0 bg-white border-r border-border-dim overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-65',
      )}
    >
      {/* Back row */}
      <div className={cn('p-4 border-b border-border-dim flex items-center', collapsed && 'justify-center px-2')}>
        {collapsed ? (
          <Link
            href="/dashboard"
            className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text-primary hover:bg-dark transition-colors no-underline"
            title="Back to Dashboard"
          >
            <ArrowLeft size={15} />
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors"
          >
            <ArrowLeft size={13} /> Back to Dashboard
          </Link>
        )}
      </div>

      {/* Subject card */}
      {!collapsed ? (
        <div className="p-4 border-b border-border-dim">
          <div className="rounded-[12px] p-4" style={{ background: `${streamColor}12` }}>
            <div className="text-2xl mb-2">{streamInfo?.icon ?? '📚'}</div>
            <div className="text-[13px] font-bold text-text-primary leading-snug">{subjectName}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{streamName}</div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-3 border-b border-border-dim" title={subjectName}>
          <span className="text-xl">{streamInfo?.icon ?? '📚'}</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-hidden">
        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={cn(
            'flex items-center py-1.75 px-2 rounded-sm cursor-pointer transition-all mb-1 w-full bg-transparent border-none text-text-muted hover:text-text-primary hover:bg-dark font-[inherit]',
            collapsed ? 'justify-center' : 'justify-end pr-3',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>

        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'sidebar-nav-item',
                active && 'active',
                collapsed && 'justify-center px-2',
              )}
            >
              <item.Icon
                size={16}
                strokeWidth={active ? 2.5 : 2}
                style={{ color: active ? item.color : undefined }}
                className={active ? '' : 'text-text-muted'}
              />
              {!collapsed && (
                <span style={active ? { color: item.color } : undefined}>
                  {item.label}
                </span>
              )}
              {!collapsed && active && (
                <span
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: item.color }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
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
                className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors bg-transparent border-none cursor-pointer"
                title="Logout"
              >
                <LogOut size={14} />
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
