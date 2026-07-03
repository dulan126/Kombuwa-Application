'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { adminService, type AdminPaper } from '@/services/admin.service';
import { isApiError } from '@/services/api-client';

export default function AdminPapersPage() {
  const { user } = useAuth();
  const [papers, setPapers] = useState<AdminPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.listPapers();
      setPapers(data);
    } catch {
      setError('Failed to load papers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function togglePublish(paper: AdminPaper) {
    setTogglingId(paper.id);
    try {
      await adminService.publishPaper(paper.id, !paper.is_published);
      setPapers(prev =>
        prev.map(p => p.id === paper.id ? { ...p, is_published: !p.is_published } : p)
      );
    } catch (err) {
      alert(isApiError(err) ? err.message : 'Failed to update paper');
    } finally {
      setTogglingId(null);
    }
  }

  async function deletePaper(paper: AdminPaper) {
    if (!confirm(`Delete "${paper.title}"? This cannot be undone.`)) return;
    setDeletingId(paper.id);
    try {
      await adminService.deletePaper(paper.id);
      setPapers(prev => prev.filter(p => p.id !== paper.id));
    } catch (err) {
      alert(isApiError(err) ? err.message : 'Failed to delete paper');
    } finally {
      setDeletingId(null);
    }
  }

  const canDelete = user?.role === 'admin';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Papers
          </h1>
          <p className="text-text-muted text-[12.5px] mt-0.5">{papers.length} papers total</p>
        </div>
        <Link
          href="/admin/papers/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-[12.5px] font-semibold no-underline hover:bg-brand-dark transition-colors"
        >
          + New Paper
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-sm bg-danger/10 border border-danger/20 text-danger text-[12.5px]">
          {error}
        </div>
      )}

      <div className="bg-surface rounded-base border border-border-dim overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : papers.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">
            No papers yet. Create your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border-dim bg-dark">
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Title</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Type</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Subject</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Qs</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Attempts</th>
                  <th className="text-left px-4 py-3 text-text-muted font-semibold">Status</th>
                  <th className="text-right px-4 py-3 text-text-muted font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {papers.map(paper => (
                  <tr key={paper.id} className="border-b border-border-dim last:border-0 hover:bg-dark/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{paper.title}</div>
                      <div className="text-text-muted text-[11px]">Grade {paper.grade}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-brand/10 text-brand uppercase">
                        {paper.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{paper.subject_name}</td>
                    <td className="px-4 py-3 text-text-muted">{paper.question_count}</td>
                    <td className="px-4 py-3 text-text-muted">{paper.attempt_count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublish(paper)}
                        disabled={togglingId === paper.id}
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                          paper.is_published
                            ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                            : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'
                        } disabled:opacity-50`}
                      >
                        {togglingId === paper.id ? '…' : paper.is_published ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/papers/${paper.id}`}
                          className="text-[11.5px] text-gold hover:underline no-underline font-medium"
                        >
                          Edit
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => deletePaper(paper)}
                            disabled={deletingId === paper.id}
                            className="text-[11.5px] text-danger hover:underline bg-transparent border-none cursor-pointer disabled:opacity-50"
                          >
                            {deletingId === paper.id ? '…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
