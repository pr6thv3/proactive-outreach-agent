import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/auth/env';

const isWebhookRoute = createRouteMatcher(['/api/webhooks(.*)']);
const isProtectedRoute = createRouteMatcher([
  '/',
  '/api(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (isWebhookRoute(request)) return NextResponse.next();

  if (!isClerkConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Clerk is not configured' }, { status: 500 });
    }

    return NextResponse.next();
  }

  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
