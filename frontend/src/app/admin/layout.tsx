'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoggedIn, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'student') {
      router.replace('/dashboard');
    }
  }, [isLoading, isLoggedIn, user, router]);

  if (isLoading || !user || user.role === 'student') {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-[60px] bg-white border-b border-border-dim flex items-center px-6 gap-4 shrink-0">
          <div className="flex-1" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted bg-dark px-2.5 py-1 rounded-full">
            {user.role}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
