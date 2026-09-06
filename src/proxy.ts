import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default async function proxy(request: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret-for-development-32-chars-min';
  const token = await getToken({ req: request, secret });
  const { pathname } = request.nextUrl;

  // Public paths
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/inngest') ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  // Local development bypass
  if (process.env.AUTH_DEV_BYPASS === 'true') {
    return NextResponse.next();
  }

  // Unauthenticated user
  if (!token) {
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Incomplete onboarding redirect to wizard
  const onboardingComplete = (token as any).onboardingComplete;
  if (!onboardingComplete && !pathname.startsWith('/onboarding') && !pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/onboarding/wizard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/admin/:path*'],
};
