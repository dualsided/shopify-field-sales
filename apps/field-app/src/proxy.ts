import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/dev', '/api/webhooks'];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // Redirect to login for page requests
    if (!pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Return 401 for API requests
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  // Verify JWT
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Extract shop and rep info from token
    const shopId = payload.shopId as string;
    const repId = payload.repId as string;
    const role = payload.role as string;

    if (!shopId || !repId) {
      throw new Error('Invalid token payload');
    }

    // Clone the request headers and add shop/rep context
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-shop-id', shopId);
    requestHeaders.set('x-rep-id', repId);
    requestHeaders.set('x-rep-role', role);

    // Return response with modified headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error('JWT verification failed:', error);

    // Clear invalid token
    const response = pathname.startsWith('/api/')
      ? NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } },
          { status: 401 }
        )
      : NextResponse.redirect(new URL('/login', request.url));

    response.cookies.delete('auth_token');
    response.cookies.delete('refresh_token');

    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|manifest.json).*)',
  ],
};
