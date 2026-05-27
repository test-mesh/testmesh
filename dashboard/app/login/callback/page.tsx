'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { apiClient } from '@/lib/api/client';

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackLoading />}>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function CallbackLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f18]">
      <div className="rounded-2xl bg-[#0f1923] border border-[#1e2d3d] px-10 py-10 text-center w-full max-w-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#1a2d3d] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
        <p className="text-sm font-semibold text-[#c8dce8] mb-1">Completing Sign In…</p>
        <p className="text-xs text-[#4a6480]">Please wait while we verify your credentials.</p>
      </div>
    </div>
  );
}

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (errorParam) { setStatus('error'); setError(errorDescription || errorParam); return; }
      if (!code) { setStatus('error'); setError('No authorization code received'); return; }

      try {
        const response = await apiClient.post('/api/v1/auth/oauth/callback', {
          code, state, redirect_uri: `${window.location.origin}/login/callback`,
        });
        const { access_token, refresh_token, user } = response.data;
        login({ access_token, refresh_token }, user);
        setStatus('success');
        setTimeout(() => router.push('/'), 1500);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setStatus('error');
        setError(axiosErr.response?.data?.error || 'Failed to complete authentication');
      }
    };
    handleCallback();
  }, [searchParams, login, router]);

  const icons = {
    loading: <Loader2 className="w-6 h-6 animate-spin text-teal-400" />,
    success: <CheckCircle className="w-6 h-6 text-teal-400" />,
    error:   <AlertCircle className="w-6 h-6 text-red-400" />,
  };

  const titles = {
    loading: 'Completing Sign In…',
    success: 'Welcome Back!',
    error:   'Authentication Failed',
  };

  const subtitles = {
    loading: 'Please wait while we verify your credentials.',
    success: 'Redirecting you to the dashboard…',
    error:   'There was a problem signing you in.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f18]">
      <div className="rounded-2xl bg-[#0f1923] border border-[#1e2d3d] px-10 py-10 text-center w-full max-w-sm">
        <div className={`w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center ${status === 'error' ? 'bg-red-400/10' : 'bg-teal-400/10'}`}>
          {icons[status]}
        </div>
        <p className="text-sm font-semibold text-[#c8dce8] mb-1">{titles[status]}</p>
        <p className="text-xs text-[#4a6480]">{subtitles[status]}</p>

        {status === 'error' && (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-3 text-left">
              <p className="text-xs text-red-400">{error}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/login')}
                className="flex-1 h-8 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => router.push('/')}
                className="flex-1 h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
              >
                Go Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
