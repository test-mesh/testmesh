'use client'

import { useEffect } from 'react'

// When NEXT_PUBLIC_CLOUD=true the OSS dashboard is part of the multi-zone SaaS
// app. Users must be logged in via the cloud login page. If no token is found
// in localStorage we redirect there instead of showing a broken UI.
const CLOUD_MODE = process.env.NEXT_PUBLIC_CLOUD === 'true'
const CLOUD_LOGIN_URL = process.env.NEXT_PUBLIC_CLOUD_LOGIN_URL || '/login'
const TOKEN_KEY = 'testmesh_auth_token'

export function CloudAuthGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!CLOUD_MODE) return
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      window.location.href = CLOUD_LOGIN_URL
    }
  }, [])

  return <>{children}</>
}
