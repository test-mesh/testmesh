'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  getOAuth2Providers,
  getAuthorizationURL,
  exchangeAuthorizationCode,
  getClientCredentialsToken,
  getPasswordGrantToken,
  refreshToken,
  type OAuth2Provider,
  type OAuth2Token,
  type OAuth2GrantType,
} from '@/lib/api/oauth2';

interface OAuth2HelperProps {
  onTokenReceived?: (token: OAuth2Token) => void;
  className?: string;
}

const GRANT_TABS: { value: OAuth2GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Auth Code' },
  { value: 'client_credentials', label: 'Client Creds' },
  { value: 'password', label: 'Password' },
];

export default function OAuth2Helper({ onTokenReceived, className }: OAuth2HelperProps) {
  const [providers, setProviders] = useState<OAuth2Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('custom');
  const [grantType, setGrantType] = useState<OAuth2GrantType>('authorization_code');

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [redirectUri, setRedirectUri] = useState(
    typeof window !== 'undefined' ? `${window.location.origin}/oauth2/callback` : ''
  );
  const [scope, setScope] = useState('');
  const [state, setState] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [currentToken, setCurrentToken] = useState<OAuth2Token | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    async function loadProviders() {
      try {
        const { providers: providerList } = await getOAuth2Providers();
        setProviders(providerList);
      } catch (err) {
        console.error('Failed to load providers:', err);
      }
    }
    loadProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider === 'custom') return;
    const provider = providers.find((p) => p.id === selectedProvider);
    if (provider) {
      setAuthUrl(provider.auth_url);
      setTokenUrl(provider.token_url);
      setScope(provider.scopes || '');
    }
  }, [selectedProvider, providers]);

  const handleCopyToken = useCallback(() => {
    if (currentToken?.access_token) {
      navigator.clipboard.writeText(currentToken.access_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentToken]);

  const handleGetAuthUrl = async () => {
    setIsLoading(true); setError(null);
    try {
      const { authorization_url } = await getAuthorizationURL({
        grant_type: 'authorization_code',
        client_id: clientId, client_secret: clientSecret,
        auth_url: authUrl, token_url: tokenUrl,
        redirect_uri: redirectUri, scope,
        state: state || crypto.randomUUID(),
      });
      window.open(authorization_url, '_blank', 'width=600,height=700');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  const handleExchangeCode = async (code: string) => {
    setIsLoading(true); setError(null);
    try {
      const token = await exchangeAuthorizationCode({
        code, client_id: clientId, client_secret: clientSecret,
        token_url: tokenUrl, redirect_uri: redirectUri,
      });
      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  const handleClientCredentials = async () => {
    setIsLoading(true); setError(null);
    try {
      const token = await getClientCredentialsToken({
        client_id: clientId, client_secret: clientSecret, token_url: tokenUrl, scope,
      });
      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  const handlePasswordGrant = async () => {
    setIsLoading(true); setError(null);
    try {
      const token = await getPasswordGrantToken({
        client_id: clientId, client_secret: clientSecret, token_url: tokenUrl, username, password, scope,
      });
      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  const handleRefreshToken = async () => {
    if (!currentToken?.refresh_token) return;
    setIsLoading(true); setError(null);
    try {
      const token = await refreshToken({
        refresh_token: currentToken.refresh_token,
        client_id: clientId, client_secret: clientSecret, token_url: tokenUrl,
      });
      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth2_callback' && event.data?.code) {
        handleExchangeCode(event.data.code);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clientId, clientSecret, tokenUrl, redirectUri]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Provider selector */}
      <div className="flex items-center gap-4">
        <Label className="w-20 text-xs">Provider</Label>
        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom Provider</SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grant type tab pills */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0b0f18] border border-[#1e2d3d]">
        {GRANT_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setGrantType(value)}
            className={cn(
              'flex-1 h-7 rounded-md text-xs font-medium transition-colors',
              grantType === value
                ? 'bg-teal-400/15 text-teal-400'
                : 'text-[#4a6480] hover:text-[#7fa8c8]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Common fields */}
      <div className="space-y-3">
        {[
          { label: 'Client ID', value: clientId, onChange: setClientId, placeholder: 'your-client-id', type: 'text' },
          { label: 'Client Secret', value: clientSecret, onChange: setClientSecret, placeholder: 'your-client-secret', type: 'password' },
        ].map(({ label, value, onChange, placeholder, type }) => (
          <div key={label} className="flex items-center gap-4">
            <Label className="w-28 text-xs shrink-0">{label}</Label>
            <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 text-xs" />
          </div>
        ))}

        {grantType === 'authorization_code' && (
          <div className="flex items-center gap-4">
            <Label className="w-28 text-xs shrink-0">Auth URL</Label>
            <Input value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} placeholder="https://provider.com/oauth/authorize" className="flex-1 text-xs" />
          </div>
        )}

        <div className="flex items-center gap-4">
          <Label className="w-28 text-xs shrink-0">Token URL</Label>
          <Input value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://provider.com/oauth/token" className="flex-1 text-xs" />
        </div>
      </div>

      {/* Grant-type specific fields */}
      {grantType === 'authorization_code' && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Label className="w-28 text-xs shrink-0">Redirect URI</Label>
            <Input value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="https://your-app.com/callback" className="flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-28 text-xs shrink-0">Scope</Label>
            <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="openid profile email" className="flex-1 text-xs" />
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')} />
                Advanced Options
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-2">
              <div className="flex items-center gap-4">
                <Label className="w-28 text-xs shrink-0">State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Random string for CSRF protection" className="flex-1 text-xs" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <button
            onClick={handleGetAuthUrl}
            disabled={!clientId || !authUrl || !tokenUrl || isLoading}
            className="flex items-center justify-center gap-1.5 w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Get New Access Token
          </button>
        </div>
      )}

      {grantType === 'client_credentials' && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Label className="w-28 text-xs shrink-0">Scope</Label>
            <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="api:read api:write" className="flex-1 text-xs" />
          </div>
          <button
            onClick={handleClientCredentials}
            disabled={!clientId || !clientSecret || !tokenUrl || isLoading}
            className="flex items-center justify-center gap-1.5 w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Get Token
          </button>
        </div>
      )}

      {grantType === 'password' && (
        <div className="space-y-3">
          {[
            { label: 'Username', value: username, onChange: setUsername, placeholder: 'user@example.com', type: 'text' },
            { label: 'Password', value: password, onChange: setPassword, placeholder: '••••••••', type: 'password' },
            { label: 'Scope', value: scope, onChange: setScope, placeholder: 'openid profile', type: 'text' },
          ].map(({ label, value, onChange, placeholder, type }) => (
            <div key={label} className="flex items-center gap-4">
              <Label className="w-28 text-xs shrink-0">{label}</Label>
              <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 text-xs" />
            </div>
          ))}
          <button
            onClick={handlePasswordGrant}
            disabled={!clientId || !tokenUrl || !username || !password || isLoading}
            className="flex items-center justify-center gap-1.5 w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
            Get Token
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-400/5 border border-red-400/20 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Token display */}
      {currentToken && (
        <div className="p-3 bg-[#0f1923] border border-[#1e2d3d] rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#c8dce8] flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-teal-400" />
              Access Token
            </span>
            <div className="flex items-center gap-1">
              {currentToken.expires_at && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(currentToken.expires_at).toLocaleTimeString()}
                </span>
              )}
              {currentToken.refresh_token && (
                <button
                  onClick={handleRefreshToken}
                  disabled={isLoading}
                  className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={handleCopyToken}
                className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <code className="block p-2 bg-[#0b0f18] border border-[#1e2d3d] rounded-lg text-[10px] font-mono break-all text-[#7fa8c8]">
            {currentToken.access_token}
          </code>
          {currentToken.token_type && (
            <div className="text-[10px] text-[#4a6480]">Token Type: {currentToken.token_type}</div>
          )}
          {currentToken.scope && (
            <div className="text-[10px] text-[#4a6480]">Scope: {currentToken.scope}</div>
          )}
        </div>
      )}
    </div>
  );
}
