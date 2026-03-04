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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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

// Pre-configured provider templates
const PROVIDER_TEMPLATES: Record<string, Partial<OAuth2Provider>> = {
  custom: {
    name: 'Custom Provider',
    auth_url: '',
    token_url: '',
    scopes: '',
  },
};

export default function OAuth2Helper({ onTokenReceived, className }: OAuth2HelperProps) {
  const [providers, setProviders] = useState<OAuth2Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('custom');
  const [grantType, setGrantType] = useState<OAuth2GrantType>('authorization_code');

  // Form fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [redirectUri, setRedirectUri] = useState(
    typeof window !== 'undefined' ? `${window.location.origin}/oauth2/callback` : ''
  );
  const [scope, setScope] = useState('');
  const [state, setState] = useState('');

  // Password grant fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Token state
  const [currentToken, setCurrentToken] = useState<OAuth2Token | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load providers
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

  // Update form when provider changes
  useEffect(() => {
    if (selectedProvider === 'custom') {
      return;
    }

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
    setIsLoading(true);
    setError(null);

    try {
      const { authorization_url } = await getAuthorizationURL({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        auth_url: authUrl,
        token_url: tokenUrl,
        redirect_uri: redirectUri,
        scope,
        state: state || crypto.randomUUID(),
      });

      // Open in new window
      window.open(authorization_url, '_blank', 'width=600,height=700');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExchangeCode = async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await exchangeAuthorizationCode({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        token_url: tokenUrl,
        redirect_uri: redirectUri,
      });

      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientCredentials = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getClientCredentialsToken({
        client_id: clientId,
        client_secret: clientSecret,
        token_url: tokenUrl,
        scope,
      });

      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordGrant = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getPasswordGrantToken({
        client_id: clientId,
        client_secret: clientSecret,
        token_url: tokenUrl,
        username,
        password,
        scope,
      });

      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!currentToken?.refresh_token) return;

    setIsLoading(true);
    setError(null);

    try {
      const token = await refreshToken({
        refresh_token: currentToken.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        token_url: tokenUrl,
      });

      setCurrentToken(token);
      onTokenReceived?.(token);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Listen for OAuth callback
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
        <Label className="w-20">Provider</Label>
        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom Provider</SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grant type selector */}
      <Tabs value={grantType} onValueChange={(v) => setGrantType(v as OAuth2GrantType)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="authorization_code" className="text-xs">
            Auth Code
          </TabsTrigger>
          <TabsTrigger value="client_credentials" className="text-xs">
            Client Creds
          </TabsTrigger>
          <TabsTrigger value="password" className="text-xs">
            Password
          </TabsTrigger>
        </TabsList>

        {/* Common fields */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Client ID</Label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="your-client-id"
              className="flex-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Client Secret</Label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="your-client-secret"
              className="flex-1 text-sm"
            />
          </div>

          {grantType === 'authorization_code' && (
            <div className="flex items-center gap-4">
              <Label className="w-20 text-sm">Auth URL</Label>
              <Input
                value={authUrl}
                onChange={(e) => setAuthUrl(e.target.value)}
                placeholder="https://provider.com/oauth/authorize"
                className="flex-1 text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Token URL</Label>
            <Input
              value={tokenUrl}
              onChange={(e) => setTokenUrl(e.target.value)}
              placeholder="https://provider.com/oauth/token"
              className="flex-1 text-sm"
            />
          </div>
        </div>

        {/* Grant-type specific content */}
        <TabsContent value="authorization_code" className="space-y-3 mt-3">
          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Redirect URI</Label>
            <Input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="https://your-app.com/callback"
              className="flex-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Scope</Label>
            <Input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="openid profile email"
              className="flex-1 text-sm"
            />
          </div>

          {/* Advanced options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                <ChevronDown
                  className={cn('w-4 h-4 mr-1 transition-transform', showAdvanced && 'rotate-180')}
                />
                Advanced Options
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-2">
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm">State</Label>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Random string for CSRF protection"
                  className="flex-1 text-sm"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Button
            onClick={handleGetAuthUrl}
            disabled={!clientId || !authUrl || !tokenUrl || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Get New Access Token
          </Button>
        </TabsContent>

        <TabsContent value="client_credentials" className="space-y-3 mt-3">
          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Scope</Label>
            <Input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="api:read api:write"
              className="flex-1 text-sm"
            />
          </div>

          <Button
            onClick={handleClientCredentials}
            disabled={!clientId || !clientSecret || !tokenUrl || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Key className="w-4 h-4 mr-2" />
            )}
            Get Token
          </Button>
        </TabsContent>

        <TabsContent value="password" className="space-y-3 mt-3">
          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="flex-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm">Scope</Label>
            <Input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="openid profile"
              className="flex-1 text-sm"
            />
          </div>

          <Button
            onClick={handlePasswordGrant}
            disabled={!clientId || !tokenUrl || !username || !password || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Shield className="w-4 h-4 mr-2" />
            )}
            Get Token
          </Button>
        </TabsContent>
      </Tabs>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Token display */}
      {currentToken && (
        <div className="p-3 bg-muted/50 rounded-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <Key className="w-4 h-4 text-green-500" />
              Access Token
            </span>
            <div className="flex items-center gap-2">
              {currentToken.expires_at && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  Expires: {new Date(currentToken.expires_at).toLocaleTimeString()}
                </Badge>
              )}
              {currentToken.refresh_token && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshToken}
                  disabled={isLoading}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleCopyToken}>
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <code className="block p-2 bg-background rounded text-xs font-mono break-all">
            {currentToken.access_token}
          </code>
          {currentToken.token_type && (
            <div className="text-xs text-muted-foreground">
              Token Type: {currentToken.token_type}
            </div>
          )}
          {currentToken.scope && (
            <div className="text-xs text-muted-foreground">Scope: {currentToken.scope}</div>
          )}
        </div>
      )}
    </div>
  );
}
