'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { forumService } from '@/services/forum.service';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar, Spinner } from '@/components/ui/ProgressBar';
import { SUBJECT_COLORS, FORUM_FILTERS } from '@/lib/constants';
import type { ForumFilterValue } from '@/lib/constants';
import { timeAgo, cn } from '@/lib/utils';
import type { Thread, Reply } from '@/types';

// ─── Thread Card ─────────────────────────────────────────────────────────────

function ThreadCard({ thread, onClick }: { thread: Thread; onClick: () => void }) {
  const color = SUBJECT_COLORS[thread.subject_id] || '#aaa';
  return (
    <div
      className="bg-surface border border-border-dim rounded-[var(--radius-base)] p-4 mb-2.5 cursor-pointer transition-all hover:border-accent/35 hover:bg-surface-2"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9.5px] font-bold tracking-[1px] uppercase mb-1" style={{ color }}>{thread.subject_name}</div>
          <div className="text-[13px] font-medium leading-[1.55]">{thread.title}</div>
        </div>
        <Badge variant={thread.status === 'resolved' ? 'success' : 'warning'}>
          {thread.status === 'resolved' ? '✓ විසඳිණ' : '⏳ පොරොත්තු'}
        </Badge>
      </div>
      <div className="flex items-center gap-3.5 mt-2">
        <span className="text-[11px] text-text-muted">👁 {thread.view_count}</span>
        <span className="text-[11px] text-text-muted">💬 {thread.reply_count}</span>
        <span className="text-[11px] text-text-muted">{timeAgo(thread.created_at)}</span>
        <Avatar name={thread.author_name} size="sm" />
      </div>
    </div>
  );
}

// ─── Subject sidebar filters ─────────────────────────────────────────────────

const SUBJECT_FILTERS = [
  { id: FORUM_FILTERS.ALL, label: 'සියලු', color: 'var(--color-accent)' },
  { id: 'm',  label: 'ගණිතය',   color: '#8b90f0' },
  { id: 'ph', label: 'භෞතිකය',  color: '#4F7FE8' },
  { id: 'ch', label: 'රසායනය',  color: '#2EC4B6' },
  { id: 'bi', label: 'ජීව',     color: '#4CAF7D' },
  { id: 'ac', label: 'ගිණුම්',  color: '#a78bfa' },
  { id: 'ec', label: 'ආර්ථිකය', color: '#fb923c' },
];

// ─── Forum Page ──────────────────────────────────────────────────────────────

export default function ForumPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ForumFilterValue | string>(FORUM_FILTERS.ALL);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<{ thread: Thread; replies: Reply[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [replyBody, setReplyBody] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { router.push('/'); return; }
  }, [isLoggedIn, router]);

  const loadThreads = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const isStatusFilter = f === FORUM_FILTERS.RESOLVED || f === FORUM_FILTERS.PENDING;
      const res = await forumService.getThreads({
        subject: (!isStatusFilter && f !== FORUM_FILTERS.ALL) ? f : undefined,
        status: isStatusFilter ? f : undefined,
      });
      setThreads(res.threads ?? []);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadThreads(filter);
  }, [isLoggedIn, filter, loadThreads]);

  const openThread = async (id: string) => {
    setSelectedThread(id);
    setDetailLoading(true);
    setThreadDetail(null);
    try {
      const res = await forumService.getThread(id);
      setThreadDetail({ thread: res.thread, replies: res.replies });
    } catch {
      showToast('Failed to load thread', 'error');
      setSelectedThread(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePostReply = async () => {
    if (!selectedThread || !replyBody.trim()) return;
    setPosting(true);
    try {
      const reply = await forumService.postReply(selectedThread, replyBody.trim());
      setThreadDetail((prev) =>
        prev ? { ...prev, replies: [...prev.replies, reply] } : prev,
      );
      setReplyBody('');
    } catch {
      showToast('Failed to post reply', 'error');
    } finally {
      setPosting(false);
    }
  };

  if (!isLoggedIn) return null;

  // ─── Thread Detail View ────────────────────────────────────────────────

  if (selectedThread) {
    if (detailLoading || !threadDetail) {
      return (
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      );
    }

    const { thread, replies } = threadDetail;
    const color = SUBJECT_COLORS[thread.subject_id] || '#aaa';

    return (
      <div className="p-6 min-h-[calc(100vh-58px)]">
        <button
          className="flex items-center gap-1.5 text-xs text-text-muted bg-transparent border-none cursor-pointer mb-4 font-[inherit] hover:text-text-primary"
          onClick={() => { setSelectedThread(null); setThreadDetail(null); }}
        >
          ← Forum
        </button>

        <div className="bg-surface border border-border-dim rounded-[var(--radius-base)] p-5 max-w-[760px] mb-3">
          <div className="text-[9.5px] font-bold tracking-[1px] uppercase mb-2" style={{ color }}>{thread.subject_name}</div>
          <h1 className="text-lg font-bold mb-3 leading-[1.5]">{thread.title}</h1>
          <div className="text-[13px] leading-[1.85] whitespace-pre-line">{thread.body}</div>
          <div className="flex items-center gap-3.5 mt-3">
            <span className="text-[11px] text-text-muted">👁 {thread.view_count}</span>
            <span className="text-[11px] text-text-muted">💬 {replies.length}</span>
            <Badge variant={thread.status === 'resolved' ? 'success' : 'warning'}>
              {thread.status === 'resolved' ? '✓ විසඳිණ' : '⏳ පොරොත්තු'}
            </Badge>
          </div>
        </div>

        <div className="text-[9.5px] font-bold tracking-[1px] uppercase text-text-muted mb-2 max-w-[760px]">
          පිළිතුරු {replies.length}ක්
        </div>
        {replies.map((r) => (
          <div
            key={r.id}
            className={cn(
              'bg-dark-2 border rounded-[var(--radius-base)] p-4 max-w-[760px] mb-2.5',
              r.is_verified ? 'border-success/30 bg-success/[0.035]' : 'border-border-dim',
            )}
          >
            {r.is_verified && (
              <div className="text-[9.5px] font-bold text-success tracking-[1px] uppercase mb-2 flex items-center gap-1">✓ Verified</div>
            )}
            <div className="flex items-center gap-2.5 mb-2">
              <Avatar name={r.name || ''} size="md" color={r.is_verified ? 'rgba(61,175,114,0.2)' : undefined} />
              <div>
                <div className="text-xs font-semibold">{r.name}</div>
                <div className="text-[10px] text-text-muted">{r.author_role ?? r.role}</div>
              </div>
            </div>
            <div className="text-[13px] leading-[1.85]">{r.body}</div>
          </div>
        ))}

        <div className="max-w-[760px] mt-5">
          <div className="text-[9.5px] font-bold tracking-[1px] uppercase text-text-muted mb-2">Reply</div>
          <textarea
            className="w-full bg-surface border border-border-dim rounded-[var(--radius-sm)] px-3 py-2.5 text-[13px] text-text-primary font-[inherit] outline-none resize-y focus:border-gold"
            rows={3}
            placeholder="ඔබේ පිළිතුර..."
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
          />
          <Button className="mt-2.5" onClick={handlePostReply} disabled={posting || !replyBody.trim()}>
            {posting ? 'Posting…' : 'Post Reply'}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Thread List View ──────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-[220px_1fr] max-md:grid-cols-1 min-h-[calc(100vh-58px)]">
      <div className="bg-dark-2 border-r border-border-dim p-5 max-md:hidden">
        <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-text-muted mb-2">විෂය</div>
        {SUBJECT_FILTERS.map((sf) => (
          <button
            key={sf.id}
            className={cn(
              'flex items-center gap-2 px-2.5 py-[7px] rounded-[var(--radius-sm)] cursor-pointer text-[11.5px] transition-all mb-0.5 w-full bg-transparent border-none text-left font-[inherit]',
              'hover:bg-surface',
              filter === sf.id ? 'bg-gold-bg text-gold' : 'text-text-primary',
            )}
            onClick={() => setFilter(sf.id)}
          >
            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: sf.color }} />
            {sf.label}
          </button>
        ))}
        <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-text-muted mb-2 mt-4">තත්ත්වය</div>
        <button
          className={cn('flex items-center gap-2 px-2.5 py-[7px] rounded-[var(--radius-sm)] cursor-pointer text-[11.5px] w-full bg-transparent border-none text-left font-[inherit]', filter === FORUM_FILTERS.RESOLVED ? 'bg-gold-bg text-gold' : 'text-text-primary hover:bg-surface')}
          onClick={() => setFilter(FORUM_FILTERS.RESOLVED)}
        >
          <span className="w-[7px] h-[7px] rounded-full bg-success shrink-0" />විසඳිණ
        </button>
        <button
          className={cn('flex items-center gap-2 px-2.5 py-[7px] rounded-[var(--radius-sm)] cursor-pointer text-[11.5px] w-full bg-transparent border-none text-left font-[inherit]', filter === FORUM_FILTERS.PENDING ? 'bg-gold-bg text-gold' : 'text-text-primary hover:bg-surface')}
          onClick={() => setFilter(FORUM_FILTERS.PENDING)}
        >
          <span className="w-[7px] h-[7px] rounded-full bg-warning shrink-0" />පොරොත්තු
        </button>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-sm font-bold">සාකච්ඡා වේදිකාව</h1>
            <p className="text-[11px] text-text-muted mt-0.5">{threads.length} ප්‍රශ්න</p>
          </div>
          <Button>+ ප්‍රශ්නය</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : threads.length === 0 ? (
          <div className="text-center py-14 text-text-muted text-[13px]">No threads found.</div>
        ) : (
          threads.map((t) => (
            <ThreadCard key={t.id} thread={t} onClick={() => openThread(t.id)} />
          ))
        )}
      </div>
    </div>
  );
}
