'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function GitHubCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const connected = params.get('github_connected');
    const error = params.get('github_error');

    if (connected === 'true') {
      setStatus('success');
      setTimeout(() => router.replace('/integrations'), 1500);
    } else if (error) {
      const messages: Record<string, string> = {
        missing_params: 'Missing OAuth parameters.',
        invalid_state: 'Invalid or expired state token.',
        state_expired: 'Authorization request expired. Please try again.',
        exchange_failed: 'Failed to exchange authorization code with GitHub.',
        create_failed: 'Failed to save GitHub integration.',
        db_error: 'Database error. Please try again.',
      };
      setErrorMsg(messages[error] ?? 'Unknown error.');
      setStatus('error');
    } else {
      router.replace('/integrations');
    }
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Connecting GitHub…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="font-medium">GitHub connected! Redirecting…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium">Connection failed</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <button className="mt-2 underline text-sm" onClick={() => router.replace('/integrations')}>
              Back to integrations
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /></div>}>
      <GitHubCallbackContent />
    </Suspense>
  );
}
