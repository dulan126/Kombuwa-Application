import { Suspense } from 'react';
import { SubjectSidebar } from '@/components/subject/SubjectSidebar';

export default async function SubjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      <Suspense fallback={null}>
        <SubjectSidebar subjectId={subjectId} />
      </Suspense>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-[60px] bg-white border-b border-border-dim flex items-center px-6 gap-4 shrink-0">
          <div className="flex-1">
            <input
              className="w-full max-w-[320px] h-8 px-3 rounded-full bg-dark border border-border-dim text-[12.5px] text-text-primary placeholder:text-text-muted outline-none focus:border-gold transition-colors"
              placeholder="Search topics, papers..."
              readOnly
            />
          </div>
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-dark transition-colors text-text-muted bg-transparent border-none cursor-pointer">
            🔔
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
