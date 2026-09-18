import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers for every response. The CSP is strict: no inline scripts,
 * no external origins. Next injects its own scripts as external files under
 * /_next/, so 'self' is sufficient.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isHttps = request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';

  const csp = [
    "default-src 'self'",
    // Next's hydration payload needs inline <script> tags for streaming.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only when TLS is actually terminated in front of the app. Over plain HTTP
    // this upgrades same-origin subresources to https:// and they fail to load.
    ...(isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Only meaningful once TLS is terminated in front of the app.
  if (isHttps) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
