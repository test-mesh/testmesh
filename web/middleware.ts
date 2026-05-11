import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const accept = request.headers.get('accept') ?? '';

  // Serve markdown representation for agents that prefer text/markdown
  if (accept.includes('text/markdown') && !accept.includes('text/html')) {
    const { pathname } = request.nextUrl;
    // Docs pages → per-page MDX, homepage → llms-full.txt
    if (pathname === '/') {
      const res = NextResponse.rewrite(new URL('/llms-full.txt', request.url));
      res.headers.set('Content-Type', 'text/markdown; charset=utf-8');
      return res;
    }
    if (pathname.startsWith('/docs')) {
      const res = NextResponse.rewrite(new URL(`${pathname}.mdx`, request.url));
      res.headers.set('Content-Type', 'text/markdown; charset=utf-8');
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/docs/:path*'],
};
