import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get('token')?.value;
  const isDemo = request.cookies.get('kw_demo')?.value === 'true';
  const isAuthenticated = !!token || isDemo;

  // 1. For backend API proxying through Next.js rewrites:
  // Inject the Authorization header if the HTTP-only cookie exists.
  if (path.startsWith('/api/')) {
    const requestHeaders = new Headers(request.headers);
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 2. Auth guards for protected UI pages:
  const protectedRoutes = ['/papers', '/rankings', '/forum', '/marking-scheme', '/past-papers'];
  const isProtectedRoute = protectedRoutes.some((route) => path === route || path.startsWith(route + '/'));

  const authRoutes = ['/register'];
  const isAuthRoute = authRoutes.some((route) => path === route || path.startsWith(route + '/'));

  if (isProtectedRoute && !isAuthenticated) {
    // Redirect unauthenticated users to the landing page
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isAuthRoute && isAuthenticated) {
    // Redirect authenticated users away from register page
    return NextResponse.redirect(new URL('/papers', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run proxy middleware on API endpoints and UI pages
  matcher: [
    '/api/:path*',
    '/papers/:path*',
    '/rankings/:path*',
    '/forum/:path*',
    '/marking-scheme/:path*',
    '/past-papers/:path*',
    '/register/:path*',
    '/register',
  ],
};
