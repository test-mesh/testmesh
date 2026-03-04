'use client';

import { useState } from 'react';
import { Lock, Key, Shield } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type AuthType = 'none' | 'basic' | 'bearer' | 'api_key' | 'oauth2';

export interface AuthConfig {
  type: AuthType;
  // Basic auth
  username?: string;
  password?: string;
  // Bearer token
  token?: string;
  // API Key
  key?: string;
  location?: 'header' | 'query';
  name?: string;
  // OAuth2 (future)
  client_id?: string;
  client_secret?: string;
  token_url?: string;
}

interface AuthBuilderProps {
  value: AuthConfig;
  onChange: (value: AuthConfig) => void;
  className?: string;
}

export default function AuthBuilder({
  value,
  onChange,
  className,
}: AuthBuilderProps) {
  const handleTypeChange = (type: AuthType) => {
    onChange({ type });
  };

  const handleFieldChange = (field: keyof AuthConfig, val: string) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Label>Authentication Type</Label>
        <Select value={value.type || 'none'} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select authentication type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span>None</span>
              </div>
            </SelectItem>
            <SelectItem value="basic">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-blue-500" />
                <span>Basic Auth</span>
              </div>
            </SelectItem>
            <SelectItem value="bearer">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-green-500" />
                <span>Bearer Token</span>
              </div>
            </SelectItem>
            <SelectItem value="api_key">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-500" />
                <span>API Key</span>
              </div>
            </SelectItem>
            <SelectItem value="oauth2" disabled>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                <span>OAuth 2.0 (Coming Soon)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Basic Auth Fields */}
      {value.type === 'basic' && (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={value.username || ''}
              onChange={(e) => handleFieldChange('username', e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={value.password || ''}
              onChange={(e) => handleFieldChange('password', e.target.value)}
              placeholder="Enter password or ${VARIABLE}"
            />
            <p className="text-xs text-muted-foreground">
              Use variables like ${'{PASSWORD}'} for secure credential storage
            </p>
          </div>
        </div>
      )}

      {/* Bearer Token Fields */}
      {value.type === 'bearer' && (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="token">Bearer Token</Label>
            <Input
              id="token"
              type="password"
              value={value.token || ''}
              onChange={(e) => handleFieldChange('token', e.target.value)}
              placeholder="Enter token or ${AUTH_TOKEN}"
            />
            <p className="text-xs text-muted-foreground">
              Token will be sent as: Authorization: Bearer {'{token}'}
            </p>
          </div>
        </div>
      )}

      {/* API Key Fields */}
      {value.type === 'api_key' && (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="api_key">API Key</Label>
            <Input
              id="api_key"
              type="password"
              value={value.key || ''}
              onChange={(e) => handleFieldChange('key', e.target.value)}
              placeholder="Enter API key or ${API_KEY}"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key_name">Key Name</Label>
            <Input
              id="key_name"
              value={value.name || 'X-API-Key'}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="X-API-Key"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key_location">Location</Label>
            <Select
              value={value.location || 'header'}
              onValueChange={(val) =>
                handleFieldChange('location', val as 'header' | 'query')
              }
            >
              <SelectTrigger id="key_location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Parameter</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {value.location === 'header'
                ? `Key will be sent as header: ${value.name || 'X-API-Key'}: {key}`
                : `Key will be sent as query param: ?${value.name || 'api_key'}={key}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
