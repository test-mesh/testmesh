'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/AuthContext';
import { apiClient } from '@/lib/api/client';

// Main page component wrapped in Suspense
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackLoading />}>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function CallbackLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
          <CardTitle>Completing Sign In...</CardTitle>
          <CardDescription>Please wait while we verify your credentials.</CardDescription>
        </CardHeader>
      </Card>
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

      // Check for OAuth error
      if (errorParam) {
        setStatus('error');
        setError(errorDescription || errorParam);
        return;
      }

      // Check for authorization code
      if (!code) {
        setStatus('error');
        setError('No authorization code received');
        return;
      }

      try {
        // Exchange the code for tokens
        const response = await apiClient.post('/api/v1/auth/oauth/callback', {
          code,
          state,
          redirect_uri: `${window.location.origin}/login/callback`,
        });

        const { access_token, refresh_token, user } = response.data;

        login(
          { access_token, refresh_token },
          user
        );

        setStatus('success');

        // Redirect to home after a brief delay to show success
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } catch (err: any) {
        setStatus('error');
        setError(err.response?.data?.error || 'Failed to complete authentication');
      }
    };

    handleCallback();
  }, [searchParams, login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center">
            {status === 'loading' && (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            )}
            {status === 'success' && (
              <CheckCircle className="w-8 h-8 text-green-500" />
            )}
            {status === 'error' && (
              <AlertCircle className="w-8 h-8 text-destructive" />
            )}
          </div>
          <CardTitle>
            {status === 'loading' && 'Completing Sign In...'}
            {status === 'success' && 'Welcome Back!'}
            {status === 'error' && 'Authentication Failed'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we verify your credentials.'}
            {status === 'success' && 'Redirecting you to the dashboard...'}
            {status === 'error' && 'There was a problem signing you in.'}
          </CardDescription>
        </CardHeader>

        {status === 'error' && (
          <CardContent className="space-y-4">
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              {error}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => router.push('/login')}>
                Try Again
              </Button>
              <Button className="flex-1" onClick={() => router.push('/')}>
                Go Home
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

