'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminService,
  type Stream,
  type Subject,
  type CreateStreamInput,
} from '@/services/admin.service';
import { isApiError } from '@/services/api-client';

// ─── Stream Card ──────────────────────────────────────────────────────────────

function StreamCard({
  stream,
  selected,
  onSelect,
  onDelete,
  isAdmin,
}: {
  stream: Stream;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-base border p-3 transition-colors cursor-pointer bg-transparent ${
        selected
          ? 'border-brand bg-brand/8'
          : 'border-border-dim hover:border-border-base'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[20px] shrink-0">{stream.icon}</span>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-text-primary truncate">{stream.name}</div>
            <div className="text-[10.5px] text-text-muted font-mono">{stream.id}</div>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="shrink-0 text-[11px] text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer px-1"
            title="Delete stream"
          >
            ✕
          </button>
        )}
      </div>
      {selected && (
        <div
          className="mt-1.5 h-0.5 rounded-full opacity-70"
          style={{ background: stream.color }}
        />
      )}
    </button>
  );
}

// ─── New Stream Form ──────────────────────────────────────────────────────────

const PRESET_ICONS = ['⚗️', '🧬', '📊', '🎨', '💻', '📐', '🔬', '📚', '🌍', '⚡'];
const PRESET_COLORS = [
  '#4F7FE8', '#3DAF72', '#8b90f0', '#A78BFA', '#2EC4B6',
  '#FB923C', '#F43F5E', '#EAB308', '#06B6D4', '#8B5CF6',
];

function NewStreamForm({ onSave, onCancel }: { onSave: (s: CreateStreamInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<CreateStreamInput>({
    id: '', name: '', icon: '📚', color: '#8b90f0', sort_order: 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = <K extends keyof CreateStreamInput>(k: K, v: CreateStreamInput[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  async function handleSave() {
    if (!form.id || !form.name) { setErr('ID and name are required'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(form);
    } catch (e) {
      setErr(isApiError(e) ? e.message : 'Failed to create stream');
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border-dim rounded-base p-4 flex flex-col gap-3 text-[12.5px]">
      <div className="font-semibold text-text-primary text-[13px]">New Stream</div>
      {err && <div className="text-danger text-[12px]">{err}</div>}
      <div className="flex gap-2">
        <div className="flex flex-col gap-1 w-24">
          <label className="text-[11px] text-text-muted font-semibold">ID</label>
          <input className="admin-input font-mono" placeholder="phy" value={form.id}
            onChange={e => set('id', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[11px] text-text-muted font-semibold">Name</label>
          <input className="admin-input" placeholder="Physical Science" value={form.name}
            onChange={e => set('name', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-text-muted font-semibold block mb-1.5">Icon</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_ICONS.map(ic => (
            <button
              key={ic}
              onClick={() => set('icon', ic)}
              className={`w-8 h-8 rounded-sm text-[16px] transition-colors cursor-pointer border ${
                form.icon === ic ? 'border-brand bg-brand/10' : 'border-border-dim bg-dark hover:border-border-base'
              }`}
            >{ic}</button>
          ))}
          <input className="admin-input w-10 text-center text-[16px] px-0" value={form.icon}
            onChange={e => set('icon', e.target.value)} placeholder="✏️" maxLength={4} />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-text-muted font-semibold block mb-1.5">Color</label>
        <div className="flex flex-wrap gap-1.5 items-center">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => set('color', c)}
              className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                form.color === c ? 'border-white scale-110' : 'border-transparent'
              }`}
              style={{ background: c }}
            />
          ))}
          <input className="admin-input w-28 font-mono text-[11.5px]" value={form.color}
            onChange={e => set('color', e.target.value)} placeholder="#4F7FE8" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-sm bg-brand text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-sm bg-dark border border-border-dim text-text-muted text-[12px] hover:border-gold transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── New Subject Form ─────────────────────────────────────────────────────────

function NewSubjectForm({ onSave, onCancel }: { onSave: (id: string, nameSi: string) => Promise<void>; onCancel: () => void }) {
  const [id, setId] = useState('');
  const [nameSi, setNameSi] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!id || !nameSi) { setErr('Code and name are required'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(id, nameSi);
    } catch (e) {
      setErr(isApiError(e) ? e.message : 'Failed to create subject');
      setSaving(false);
    }
  }

  return (
    <div className="flex items-end gap-2 mt-2 flex-wrap">
      {err && <div className="w-full text-danger text-[11.5px]">{err}</div>}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-text-muted font-semibold">Code</label>
        <input className="admin-input w-20 font-mono" placeholder="ph" value={id}
          onChange={e => setId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} maxLength={10} />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
        <label className="text-[11px] text-text-muted font-semibold">Name (Sinhala)</label>
        <input className="admin-input" placeholder="භෞතිකය" value={nameSi}
          onChange={e => setNameSi(e.target.value)} />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-3 py-[7px] rounded-sm bg-brand text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
      >
        {saving ? '…' : 'Add'}
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-[7px] rounded-sm bg-dark border border-border-dim text-text-muted text-[12px] cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [streams, setStreams] = useState<Stream[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [streamSubjects, setStreamSubjects] = useState<Subject[]>([]);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);

  const [showStreamForm, setShowStreamForm] = useState(false);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [loadingStreams, setLoadingStreams] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingStreamSubjects, setLoadingStreamSubjects] = useState(false);
  const [error, setError] = useState('');

  // ── Load all streams and subjects on mount ────────────────────────────────

  useEffect(() => {
    adminService.listStreams()
      .then(setStreams)
      .catch(() => setError('Failed to load streams'))
      .finally(() => setLoadingStreams(false));

    adminService.listSubjects()
      .then(setSubjects)
      .catch(() => setError('Failed to load subjects'))
      .finally(() => setLoadingSubjects(false));
  }, []);

  // ── Load subjects for selected stream ─────────────────────────────────────

  const loadStreamSubjects = useCallback(async (streamId: string) => {
    setLoadingStreamSubjects(true);
    try {
      const data = await adminService.listStreamSubjects(streamId);
      setStreamSubjects(data);
    } catch {
      setError('Failed to load stream subjects');
    } finally {
      setLoadingStreamSubjects(false);
    }
  }, []);

  function handleSelectStream(stream: Stream) {
    setSelectedStream(stream);
    setAssignSubjectId('');
    loadStreamSubjects(stream.id);
  }

  // ── Stream CRUD ───────────────────────────────────────────────────────────

  async function handleCreateStream(data: CreateStreamInput) {
    const newStream = await adminService.createStream(data);
    setStreams(prev => [...prev, newStream].sort((a, b) => a.sort_order - b.sort_order));
    setShowStreamForm(false);
  }

  async function handleDeleteStream(stream: Stream) {
    if (!confirm(`Delete stream "${stream.name}"? This will remove all subject assignments for this stream.`)) return;
    await adminService.deleteStream(stream.id);
    setStreams(prev => prev.filter(s => s.id !== stream.id));
    if (selectedStream?.id === stream.id) {
      setSelectedStream(null);
      setStreamSubjects([]);
    }
    setSubjects(prev => prev.map(s => ({
      ...s,
      stream_ids: s.stream_ids.filter(id => id !== stream.id),
    })));
  }

  // ── Subject CRUD ──────────────────────────────────────────────────────────

  async function handleCreateSubject(id: string, nameSi: string) {
    await adminService.createSubject({ id, name_si: nameSi });
    setSubjects(prev => [...prev, { id, name_si: nameSi, stream_ids: [] }]
      .sort((a, b) => a.name_si.localeCompare(b.name_si)));
    setShowSubjectForm(false);
  }

  async function handleDeleteSubject(subject: Subject) {
    if (!confirm(`Delete subject "${subject.name_si}" (${subject.id})? This will also remove it from all streams.`)) return;
    await adminService.deleteSubject(subject.id);
    setSubjects(prev => prev.filter(s => s.id !== subject.id));
    setStreamSubjects(prev => prev.filter(s => s.id !== subject.id));
  }

  // ── Stream-subject assignments ────────────────────────────────────────────

  async function handleAssign() {
    if (!selectedStream || !assignSubjectId) return;
    setAssigning(true);
    try {
      await adminService.addSubjectToStream(selectedStream.id, assignSubjectId);
      const added = subjects.find(s => s.id === assignSubjectId);
      if (added && !streamSubjects.find(s => s.id === assignSubjectId)) {
        setStreamSubjects(prev => [...prev, { ...added, stream_ids: [selectedStream.id] }]);
      }
      setSubjects(prev => prev.map(s =>
        s.id === assignSubjectId && !s.stream_ids.includes(selectedStream.id)
          ? { ...s, stream_ids: [...s.stream_ids, selectedStream.id] }
          : s
      ));
      setAssignSubjectId('');
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Failed to assign subject');
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemoveFromStream(subjectId: string) {
    if (!selectedStream) return;
    await adminService.removeSubjectFromStream(selectedStream.id, subjectId);
    setStreamSubjects(prev => prev.filter(s => s.id !== subjectId));
    setSubjects(prev => prev.map(s =>
      s.id === subjectId
        ? { ...s, stream_ids: s.stream_ids.filter(id => id !== selectedStream.id) }
        : s
    ));
  }

  // ─────────────────────────────────────────────────────────────────────────

  const streamSubjectIds = new Set(streamSubjects.map(s => s.id));
  const unassignedSubjects = subjects.filter(s => !streamSubjectIds.has(s.id));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Streams & Subjects
        </h1>
        <p className="text-text-muted text-[12.5px] mt-0.5">
          Manage academic streams and assign subjects to them.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-sm bg-danger/10 border border-danger/20 text-danger text-[12.5px]">
          {error}
          <button onClick={() => setError('')} className="ml-3 underline cursor-pointer bg-transparent border-none text-danger text-[12px]">dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">

        {/* ── Left: Streams panel ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-text-primary">Streams</h2>
            {isAdmin && !showStreamForm && (
              <button
                onClick={() => setShowStreamForm(true)}
                className="text-[11.5px] text-brand hover:opacity-80 bg-transparent border-none cursor-pointer font-semibold"
              >
                + New
              </button>
            )}
          </div>

          {showStreamForm && (
            <NewStreamForm
              onSave={handleCreateStream}
              onCancel={() => setShowStreamForm(false)}
            />
          )}

          {loadingStreams ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-base bg-dark animate-pulse" />)}
            </div>
          ) : streams.length === 0 ? (
            <p className="text-text-muted text-[12.5px]">No streams yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {streams.map(s => (
                <StreamCard
                  key={s.id}
                  stream={s}
                  selected={selectedStream?.id === s.id}
                  onSelect={() => handleSelectStream(s)}
                  onDelete={() => handleDeleteStream(s)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Subjects panels ── */}
        <div className="flex flex-col gap-5">

          {/* Stream-subjects assignment */}
          <div className="bg-surface rounded-base border border-border-dim p-4">
            <h2 className="text-[13px] font-bold text-text-primary mb-3">
              {selectedStream
                ? `Subjects in ${selectedStream.name}`
                : 'Select a stream to manage its subjects'}
            </h2>

            {selectedStream ? (
              <>
                {/* Assign subject */}
                {isAdmin && (
                  <div className="flex gap-2 mb-3">
                    <select
                      value={assignSubjectId}
                      onChange={e => setAssignSubjectId(e.target.value)}
                      className="admin-input flex-1 text-[12.5px]"
                    >
                      <option value="">— add a subject to this stream —</option>
                      {unassignedSubjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name_si} ({s.id})</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={!assignSubjectId || assigning}
                      className="px-3 py-1.5 rounded-sm bg-brand text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer border-none shrink-0"
                    >
                      {assigning ? '…' : 'Add'}
                    </button>
                  </div>
                )}

                {loadingStreamSubjects ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-9 rounded-sm bg-dark animate-pulse" />)}
                  </div>
                ) : streamSubjects.length === 0 ? (
                  <p className="text-text-muted text-[12.5px]">No subjects in this stream yet.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {streamSubjects.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-sm hover:bg-dark transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-[11px] text-text-muted bg-dark px-1.5 py-0.5 rounded shrink-0">{s.id}</span>
                          <span className="text-[12.5px] text-text-primary truncate">{s.name_si}</span>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => handleRemoveFromStream(s.id)}
                            className="shrink-0 text-[11px] text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-text-muted text-[12.5px]">
                Click a stream on the left to view and manage its subjects.
              </p>
            )}
          </div>

          {/* All subjects */}
          <div className="bg-surface rounded-base border border-border-dim p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-bold text-text-primary">All Subjects</h2>
              {isAdmin && !showSubjectForm && (
                <button
                  onClick={() => setShowSubjectForm(true)}
                  className="text-[11.5px] text-brand hover:opacity-80 bg-transparent border-none cursor-pointer font-semibold"
                >
                  + New Subject
                </button>
              )}
            </div>

            {showSubjectForm && (
              <NewSubjectForm
                onSave={handleCreateSubject}
                onCancel={() => setShowSubjectForm(false)}
              />
            )}

            {loadingSubjects ? (
              <div className="space-y-2 mt-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-9 rounded-sm bg-dark animate-pulse" />)}
              </div>
            ) : subjects.length === 0 ? (
              <p className="text-text-muted text-[12.5px]">No subjects yet.</p>
            ) : (
              <div className="flex flex-col gap-1 mt-1">
                {subjects.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-sm hover:bg-dark transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[11px] text-text-muted bg-dark px-1.5 py-0.5 rounded shrink-0">{s.id}</span>
                      <span className="text-[12.5px] text-text-primary">{s.name_si}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.stream_ids.length > 0 && (
                        <div className="flex gap-1">
                          {s.stream_ids.map(sid => {
                            const str = streams.find(st => st.id === sid);
                            return (
                              <span
                                key={sid}
                                className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                style={{
                                  background: str ? str.color + '22' : 'rgba(139,144,240,0.13)',
                                  color: str?.color ?? '#8b90f0',
                                }}
                              >
                                {sid}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteSubject(s)}
                          className="text-[11px] text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer"
                        >
                          Del
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
