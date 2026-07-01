import { NextResponse } from 'next/server';

// POST /api/auth/demo-session — set kw_demo cookie via server (no JS access needed)
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('kw_demo', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

// DELETE /api/auth/demo-session — clear kw_demo cookie
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('kw_demo', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
