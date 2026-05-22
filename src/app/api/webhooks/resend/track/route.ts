// ─── Tracking: Open/Click Pixel & Redirect ─────────────
// Handles open tracking pixel and click tracking redirects

import { NextRequest, NextResponse } from 'next/server';
import { handleTrackedOpen, handleTrackedClick } from '@/lib/deliverability/tracking';

// Smallest valid 1x1 transparent PNG
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event');
  const messageId = searchParams.get('mid');
  const url = searchParams.get('url');

  if (!messageId) {
    // Return pixel even for invalid requests (don't break email rendering)
    return new NextResponse(TRACKING_PIXEL, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  }

  // Process the tracking event asynchronously
  try {
    if (event === 'opened') {
      await handleTrackedOpen(messageId);
    } else if (event === 'clicked' && url) {
      await handleTrackedClick(messageId, url);

      // Redirect to the original URL
      return NextResponse.redirect(url, 302);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('Tracking error:', error);
  }

  // Return the tracking pixel
  return new NextResponse(TRACKING_PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
