'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, Database, BookOpen, Users,
  LogOut, ChevronLeft, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  Icon: LucideIcon;
  color: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     Icon: LayoutDashboard, color: '#8b90f0', href: '/admin/dashboard' },
  { label: 'Papers',        Icon: FileText,         color: '#4F7FE8', href: '/admin/papers'    },
  { label: 'Question Pool', Icon: Database,         color: '#2EC4B6', href: '/admin/questions' },
  { label: 'Subjects',      Icon: BookOpen,         color: '#FB923C', href: '/admin/subjects'  },
  { label: 'Users',         Icon: Users,            color: '#A78BFA', href: '/admin/users'     },
];

const STORAGE_KEY = 'admin-sidebar-collapsed';

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, isLoggedIn, logout } = useAuth();
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

  const isActive = (href: string) =>
    href === '/admin/dashboard' ? pathname === href : pathname.startsWith(href);

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col h-screen sticky top-0 bg-white border-r border-border-dim overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-65',
      )}
    >
      {/* Brand */}
      <div className={cn('p-4 border-b border-border-dim flex items-center gap-2', collapsed && 'justify-center px-2')}>
        <Link href="/admin/dashboard" className="flex items-center gap-2 no-underline" title="Dashboard">
          <div className="w-8 h-8 rounded-sm gradient-brand flex items-center justify-center text-white font-bold text-[14px] shrink-0">
            M
          </div>
          {!collapsed && (
            <div>
              <div className="text-[13.5px] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                Mied<span className="text-gold">vance</span>
              </div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide font-semibold">Admin</div>
            </div>
          )}
        </Link>
      </div>

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
          {collapsed
            ? <ChevronRight size={15} />
            : <ChevronLeft size={15} />}
        </button>

        {NAV_ITEMS.map((item) => {
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
        {isLoggedIn && user && (
          collapsed ? (
            <div
              className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-[13px] shrink-0 cursor-pointer"
              title={`${user.name} · ${user.role}`}
            >
              {initial}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-[13px] shrink-0">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-text-primary truncate">{user.name}</div>
                <div className="text-[11px] text-text-muted capitalize">{user.role}</div>
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
        )}
      </div>
    </aside>
  );
}
