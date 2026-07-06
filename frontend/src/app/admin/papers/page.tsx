import { redirect } from 'next/navigation';

// Papers are now split into per-type pages (Daily MCQ / SRP Papers).
export default function AdminPapersPage() {
  redirect('/admin/papers/daily');
}
