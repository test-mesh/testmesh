'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// When NEXT_PUBLIC_CLOUD_URL is set the OSS dashboard is part of the multi-zone
// SaaS app. Users must be logged in via the cloud login page. If no token is
// found in localStorage we redirect to /login (which redirects to cloud login).
const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL
const TOKEN_KEY = 'testmesh_auth_token'

// Pages that are part of the auth flow — do not redirect these.
const AUTH_PATHS = ['/login', '/register', '/auth/callback']

export function CloudAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    if (!CLOUD_URL) return
    if (AUTH_PATHS.some(p => pathname.startsWith(p))) return
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      window.location.replace('/login')
    }
  }, [pathname])

  return <>{children}</>
}
