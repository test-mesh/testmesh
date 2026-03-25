'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

// Storage keys used by AuthContext
const TOKEN_KEY = 'testmesh_auth_token';
const REFRESH_TOKEN_KEY = 'testmesh_refresh_token';
const USER_KEY = 'testmesh_user';

/**
 * /auth/callback — cloud token handoff landing page.
 *
 * After the user signs in on the cloud dashboard, they are redirected here with:
 *   ?token=<access_token>&refresh=<refresh_token>&user=<json>
 *
 * We store the tokens in localStorage under the OSS AuthContext keys so the rest
 * of the OSS dashboard treats the user as authenticated, then redirect to /.
 *
 * This page is only reachable when NEXT_PUBLIC_CLOUD_URL is configured.
 * In standalone OSS mode it is never linked to and can be safely ignored.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refresh = params.get('refresh');
    const userRaw = params.get('user');

    if (!token) {
      // No token — just go home; AuthContext will redirect to /login if needed.
      router.replace('/');
      return;
    }

    try {
      const user = userRaw ? JSON.parse(userRaw) : null;

      // Persist directly so AuthContext picks it up synchronously on next render.
      localStorage.setItem(TOKEN_KEY, token);
      if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Also drive through the AuthContext so in-memory state is updated.
      if (user) {
        login({ access_token: token, refresh_token: refresh ?? undefined }, user);
      }
    } catch {
      // Malformed user JSON — still have a valid token, just skip user object.
      localStorage.setItem(TOKEN_KEY, token);
      if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    }

    // Clean the URL and send the user to the app.
    router.replace('/');
  }, [login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Signing you in…</p>
    </div>
  );
}
