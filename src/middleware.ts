import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth-token';

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('soc_session')?.value;
  const verification = await verifySessionToken(sessionCookie);
  const isAuthenticated = verification.valid;
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  // If unauthenticated and trying to access protected route -> redirect to /login
  if (!isAuthenticated && !isLoginPage) {
    const redirectUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(redirectUrl);
    if (sessionCookie) {
      // Clear invalid / expired / forged cookie
      response.cookies.delete('soc_session');
    }
    return response;
  }

  // If authenticated and trying to access /login -> redirect to home /
  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|deploy_agent.ps1|deploy_agent.sh|README_DEPLOYMENT.txt).*)'],
};
