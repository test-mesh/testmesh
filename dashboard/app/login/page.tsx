'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock, Github, Chrome } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/AuthContext';
import { apiClient } from '@/lib/api/client';

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    if (CLOUD_URL) {
      const next = encodeURIComponent(`${window.location.origin}/auth/callback`);
      window.location.replace(`${CLOUD_URL}/login?next=${next}`);
    }
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/api/v1/auth/login', { email, password });
      const { access_token, refresh_token, user } = response.data;
      login({ access_token, refresh_token }, user);
      router.push('/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/api/v1/auth/oauth/${provider}/url`, {
        params: { redirect_uri: `${window.location.origin}/login/callback` },
      });
      window.location.href = response.data.authorization_url;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || `Failed to initiate ${provider} login`);
      setIsLoading(false);
    }
  };

  if (CLOUD_URL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f18]">
        <Loader2 className="w-6 h-6 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f18] p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-[#1a2332]">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center">
              <span className="text-xl">🧪</span>
            </div>
            <h1 className="text-xl font-semibold text-[#c8dce8] mb-1">Welcome to TestMesh</h1>
            <p className="text-xs text-[#4a6480]">Sign in to manage your test flows and executions</p>
          </div>

          <div className="px-8 py-6 space-y-5">
            {/* OAuth */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleOAuthLogin('google')}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
              >
                <Chrome className="w-3.5 h-3.5" />
                Google
              </button>
              <button
                onClick={() => handleOAuthLogin('github')}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                GitHub
              </button>
            </div>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-[#1a2332]" />
              <span className="text-[10px] text-[#3d5670] uppercase tracking-wider">or continue with email</span>
              <div className="flex-1 h-px bg-[#1a2332]" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-[#7fa8c8]">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3d5670]" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-8 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670] focus:border-teal-400/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] text-[#7fa8c8]">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3d5670]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 h-8 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670] focus:border-teal-400/50"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-3">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Sign In
              </button>
            </form>
          </div>

          <div className="px-8 pb-6 flex flex-col gap-1 items-center text-xs text-[#3d5670]">
            <p>
              Don&apos;t have an account?{' '}
              <a href="/register" className="text-[#4a6480] hover:text-teal-400 transition-colors">Sign up</a>
            </p>
            <a href="/forgot-password" className="hover:text-[#7fa8c8] transition-colors">Forgot your password?</a>
          </div>
        </div>
      </div>
    </div>
  );
}
