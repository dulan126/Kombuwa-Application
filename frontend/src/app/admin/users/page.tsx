'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { adminService, type AdminUser } from '@/services/admin.service';
import { isApiError } from '@/services/api-client';
import { AdminDialog, type DialogState } from '@/components/ui/AdminDialog';
import { Pagination } from '@/components/ui/Pagination';

const ROLE_OPTIONS = ['student', 'editor', 'admin'];

const ROLE_BADGE: Record<string, string> = {
  student: 'bg-dark text-text-muted border-border-dim',
  editor:  'bg-brand/10 text-brand border-brand/20',
  admin:   'bg-gold/10 text-gold border-gold/20',
  teacher: 'bg-aqua/10 text-aqua border-aqua/20',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border capitalize ${ROLE_BADGE[role] ?? 'bg-dark text-text-muted border-border-dim'}`}>
      {role}
    </span>
  );
}

const LIMIT = 50;

export default function UsersPage() {
  const { user: me } = useAuth();
  const canManage = me?.role === 'admin';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.listUsers({ page, limit: LIMIT });
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function handleRoleChange(u: AdminUser, role: string) {
    if (!canManage) return;
    setUpdatingId(u.id);
    try {
      await adminService.updateUserRole(u.id, role);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, _role: role } as AdminUser & { _role: string } : x));
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to update role' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleStatusToggle(u: AdminUser & { is_active?: boolean }) {
    if (!canManage) return;
    const next = !(u.is_active ?? true);
    setUpdatingId(u.id);
    try {
      await adminService.updateUserStatus(u.id, next);
      setUsers(prev =>
        prev.map(x => x.id === u.id ? { ...x, is_active: next } as AdminUser & { is_active: boolean } : x)
      );
    } catch (err) {
      setDialog({ type: 'alert', title: 'Error', message: isApiError(err) ? err.message : 'Failed to update status' });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Users
        </h1>
        <p className="text-text-muted text-[12.5px] mt-0.5">{total} students</p>
      </div>

      <div className="bg-surface rounded-base border border-border-dim overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border-dim bg-dark">
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Name</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Mobile</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Stream / Grade</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">District</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Role</th>
                  {canManage && (
                    <th className="text-right px-4 py-3 text-text-muted font-semibold">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const extU = u as AdminUser & { _role?: string; is_active?: boolean };
                  const displayRole = extU._role ?? 'student';
                  const isActive = extU.is_active !== false;
                  const busy = updatingId === u.id;
                  return (
                    <tr key={u.id} className="border-b border-border-dim last:border-0 hover:bg-dark/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{u.name}</div>
                        {!isActive && (
                          <div className="text-[10.5px] text-danger mt-0.5">Inactive</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted">{u.mobile}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {u.stream ? `${u.stream} / G${u.grade}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-text-muted">{u.district ?? '—'}</td>
                      <td className="px-4 py-3">
                        <RoleBadge role={displayRole} />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={displayRole}
                              disabled={busy}
                              onChange={e => handleRoleChange(u, e.target.value)}
                              className="admin-input py-0.5 text-[11.5px] w-24 disabled:opacity-50"
                            >
                              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button
                              onClick={() => handleStatusToggle(extU)}
                              disabled={busy}
                              className={`text-[11.5px] px-2.5 py-0.5 rounded-sm border transition-colors cursor-pointer disabled:opacity-50 ${
                                isActive
                                  ? 'bg-danger/5 text-danger border-danger/20 hover:bg-danger/10'
                                  : 'bg-success/5 text-success border-success/20 hover:bg-success/10'
                              }`}
                            >
                              {busy ? '…' : isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.ceil(total / LIMIT)} onPage={setPage} />
      </div>
      {dialog && <AdminDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
