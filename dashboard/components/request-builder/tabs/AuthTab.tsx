'use client';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuthConfig, AuthType } from '../types';

interface AuthTabProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

const AUTH_TYPES: { value: AuthType; label: string; description: string }[] = [
  { value: 'none', label: 'No Auth', description: 'No authentication' },
  { value: 'basic', label: 'Basic Auth', description: 'Username and password' },
  { value: 'bearer', label: 'Bearer Token', description: 'JWT or OAuth token' },
  { value: 'api_key', label: 'API Key', description: 'Header or query param' },
  // OAuth2 is more complex, we'll add it in Phase E
];

export default function AuthTab({ auth, onChange }: AuthTabProps) {
  const updateAuth = (updates: Partial<AuthConfig>) => {
    onChange({ ...auth, ...updates });
  };

  const handleTypeChange = (type: AuthType) => {
    const newAuth: AuthConfig = { type };

    switch (type) {
      case 'basic':
        newAuth.basic = auth.basic || { username: '', password: '' };
        break;
      case 'bearer':
        newAuth.bearer = auth.bearer || { token: '', prefix: 'Bearer' };
        break;
      case 'api_key':
        newAuth.api_key = auth.api_key || { key: '', value: '', in: 'header' };
        break;
    }

    onChange(newAuth);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Auth type selector */}
      <div className="flex items-center gap-4">
        <Label className="text-sm">Type:</Label>
        <Select value={auth.type} onValueChange={(v) => handleTypeChange(v as AuthType)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTH_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex flex-col items-start">
                  <span>{type.label}</span>
                  <span className="text-xs text-muted-foreground">{type.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Auth configuration based on type */}
      {auth.type === 'none' && (
        <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-lg">
          No authentication configured. The request will be sent without any auth headers.
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="space-y-4 border rounded-lg p-4">
          <div className="text-sm font-medium">Basic Authentication</div>
          <div className="text-xs text-muted-foreground mb-4">
            Sends credentials as a Base64-encoded Authorization header
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right text-sm">
                Username
              </Label>
              <Input
                id="username"
                value={auth.basic?.username || ''}
                onChange={(e) =>
                  updateAuth({
                    basic: { ...auth.basic, username: e.target.value, password: auth.basic?.password || '' },
                  })
                }
                placeholder="Enter username"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right text-sm">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={auth.basic?.password || ''}
                onChange={(e) =>
                  updateAuth({
                    basic: { ...auth.basic, username: auth.basic?.username || '', password: e.target.value },
                  })
                }
                placeholder="Enter password"
                className="col-span-3"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-4 p-2 bg-muted rounded">
            Header: <code>Authorization: Basic {'<base64(username:password)>'}</code>
          </div>
        </div>
      )}

      {auth.type === 'bearer' && (
        <div className="space-y-4 border rounded-lg p-4">
          <div className="text-sm font-medium">Bearer Token</div>
          <div className="text-xs text-muted-foreground mb-4">
            Sends a token in the Authorization header (commonly used for JWT or OAuth)
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="token" className="text-right text-sm">
                Token
              </Label>
              <Input
                id="token"
                value={auth.bearer?.token || ''}
                onChange={(e) =>
                  updateAuth({
                    bearer: { ...auth.bearer, token: e.target.value },
                  })
                }
                placeholder="Enter token (e.g., JWT)"
                className="col-span-3 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="prefix" className="text-right text-sm">
                Prefix
              </Label>
              <Input
                id="prefix"
                value={auth.bearer?.prefix || 'Bearer'}
                onChange={(e) =>
                  updateAuth({
                    bearer: { ...auth.bearer, token: auth.bearer?.token || '', prefix: e.target.value },
                  })
                }
                placeholder="Bearer"
                className="col-span-3"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-4 p-2 bg-muted rounded">
            Header: <code>Authorization: {auth.bearer?.prefix || 'Bearer'} {'<token>'}</code>
          </div>
        </div>
      )}

      {auth.type === 'api_key' && (
        <div className="space-y-4 border rounded-lg p-4">
          <div className="text-sm font-medium">API Key</div>
          <div className="text-xs text-muted-foreground mb-4">
            Sends an API key as a header or query parameter
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="api-key-name" className="text-right text-sm">
                Key Name
              </Label>
              <Input
                id="api-key-name"
                value={auth.api_key?.key || ''}
                onChange={(e) =>
                  updateAuth({
                    api_key: { ...auth.api_key, key: e.target.value, value: auth.api_key?.value || '', in: auth.api_key?.in || 'header' },
                  })
                }
                placeholder="e.g., X-API-Key or api_key"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="api-key-value" className="text-right text-sm">
                Value
              </Label>
              <Input
                id="api-key-value"
                value={auth.api_key?.value || ''}
                onChange={(e) =>
                  updateAuth({
                    api_key: { ...auth.api_key, key: auth.api_key?.key || '', value: e.target.value, in: auth.api_key?.in || 'header' },
                  })
                }
                placeholder="Enter API key value"
                className="col-span-3 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">Add to</Label>
              <div className="col-span-3 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="api-key-in"
                    checked={auth.api_key?.in === 'header'}
                    onChange={() =>
                      updateAuth({
                        api_key: { ...auth.api_key, key: auth.api_key?.key || '', value: auth.api_key?.value || '', in: 'header' },
                      })
                    }
                    className="accent-primary"
                  />
                  <span className="text-sm">Header</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="api-key-in"
                    checked={auth.api_key?.in === 'query'}
                    onChange={() =>
                      updateAuth({
                        api_key: { ...auth.api_key, key: auth.api_key?.key || '', value: auth.api_key?.value || '', in: 'query' },
                      })
                    }
                    className="accent-primary"
                  />
                  <span className="text-sm">Query Parameter</span>
                </label>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-4 p-2 bg-muted rounded">
            {auth.api_key?.in === 'header' ? (
              <>Header: <code>{auth.api_key?.key || 'X-API-Key'}: {'<value>'}</code></>
            ) : (
              <>Query: <code>?{auth.api_key?.key || 'api_key'}={'<value>'}</code></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
