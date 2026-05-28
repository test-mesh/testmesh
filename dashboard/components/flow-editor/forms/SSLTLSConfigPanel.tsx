'use client';

import { useState } from 'react';
import { Shield, Lock, Key, FileKey, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SSLTLSConfig {
  client_cert?: string;
  client_key?: string;
  client_key_passphrase?: string;
  ca_cert?: string;
  ca_bundle?: string;
  min_tls_version?: 'TLS1.0' | 'TLS1.1' | 'TLS1.2' | 'TLS1.3';
  max_tls_version?: 'TLS1.0' | 'TLS1.1' | 'TLS1.2' | 'TLS1.3';
  cipher_suites?: string[];
  verify_ssl?: boolean;
  verify_hostname?: boolean;
  server_name?: string;
  allow_insecure?: boolean;
  client_auth_type?: 'none' | 'optional' | 'required';
}

interface SSLTLSConfigPanelProps {
  value: SSLTLSConfig;
  onChange: (config: SSLTLSConfig) => void;
  className?: string;
}

const TLS_VERSIONS = [
  { value: 'TLS1.0', label: 'TLS 1.0 (Legacy)', recommended: false },
  { value: 'TLS1.1', label: 'TLS 1.1 (Deprecated)', recommended: false },
  { value: 'TLS1.2', label: 'TLS 1.2 (Standard)', recommended: true },
  { value: 'TLS1.3', label: 'TLS 1.3 (Modern)', recommended: true },
];

const COMMON_CIPHER_SUITES = [
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_128_GCM_SHA256',
  'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
  'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
  'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
];

type SSLTab = 'certificates' | 'tls-version' | 'verification';

export default function SSLTLSConfigPanel({
  value,
  onChange,
  className,
}: SSLTLSConfigPanelProps) {
  const [certInputMode, setCertInputMode] = useState<'file' | 'text'>('file');
  const [activeTab, setActiveTab] = useState<SSLTab>('certificates');

  const updateConfig = (updates: Partial<SSLTLSConfig>) => {
    onChange({ ...value, ...updates });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b border-[#1a2332]">
        <Shield className="h-4 w-4 text-teal-400" />
        <span className="text-sm font-medium text-[#c8dce8]">SSL/TLS Configuration</span>
      </div>

      <div className="p-3 bg-teal-400/5 border border-teal-400/20 rounded-lg">
        <p className="text-sm text-[#c8dce8]">
          Configure SSL/TLS settings for secure HTTPS communication with client certificates,
          custom CA bundles, and TLS version controls.
        </p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-1 p-1 bg-[#0f1923] rounded-lg border border-[#1e2d3d]">
        {([
          { id: 'certificates', label: 'Certificates', icon: Key },
          { id: 'tls-version', label: 'TLS Version', icon: Lock },
          { id: 'verification', label: 'Verification', icon: Shield },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1 flex-1 h-7 px-2 rounded text-xs font-medium transition-colors',
              activeTab === id
                ? 'bg-[#1a2332] text-[#c8dce8]'
                : 'text-[#4a6480] hover:text-[#7fa8c8]'
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <FileKey className="w-4 h-4" />
              Client Certificate (Mutual TLS)
            </Label>

            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setCertInputMode('file')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  certInputMode === 'file'
                    ? 'bg-teal-400 text-[#0b0f18]'
                    : 'bg-[#1a2332] hover:bg-[#1e2d3d] text-[#7fa8c8]'
                )}
              >
                File Path
              </button>
              <button
                type="button"
                onClick={() => setCertInputMode('text')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  certInputMode === 'text'
                    ? 'bg-teal-400 text-[#0b0f18]'
                    : 'bg-[#1a2332] hover:bg-[#1e2d3d] text-[#7fa8c8]'
                )}
              >
                PEM Content
              </button>
            </div>

            {certInputMode === 'file' ? (
              <div className="space-y-2">
                <Label htmlFor="client_cert" className="text-xs">
                  Certificate File Path
                </Label>
                <Input
                  id="client_cert"
                  value={value.client_cert || ''}
                  onChange={(e) => updateConfig({ client_cert: e.target.value })}
                  placeholder="/path/to/client.crt"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-[#4a6480]">
                  Path to client certificate file (PEM format)
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="client_cert_content" className="text-xs">
                  Certificate PEM Content
                </Label>
                <Textarea
                  id="client_cert_content"
                  value={value.client_cert || ''}
                  onChange={(e) => updateConfig({ client_cert: e.target.value })}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="client_key" className="text-xs">
                Private Key {certInputMode === 'file' ? 'Path' : 'Content'}
              </Label>
              {certInputMode === 'file' ? (
                <Input
                  id="client_key"
                  value={value.client_key || ''}
                  onChange={(e) => updateConfig({ client_key: e.target.value })}
                  placeholder="/path/to/client.key"
                  className="font-mono text-sm"
                />
              ) : (
                <Textarea
                  id="client_key"
                  value={value.client_key || ''}
                  onChange={(e) => updateConfig({ client_key: e.target.value })}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  rows={4}
                  className="font-mono text-xs"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_key_passphrase" className="text-xs">
                Private Key Passphrase (Optional)
              </Label>
              <Input
                id="client_key_passphrase"
                type="password"
                value={value.client_key_passphrase || ''}
                onChange={(e) => updateConfig({ client_key_passphrase: e.target.value })}
                placeholder="Enter passphrase if key is encrypted"
                className="font-mono text-sm"
              />
              <p className="text-xs text-[#4a6480]">
                Leave empty if private key is not encrypted
              </p>
            </div>
          </div>

          <div className="border-t border-[#1e2d3d] pt-3" />

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Certificate Authority (CA)
            </Label>

            <div className="space-y-2">
              <Label htmlFor="ca_cert" className="text-xs">
                CA Certificate {certInputMode === 'file' ? 'Path' : 'Content'}
              </Label>
              {certInputMode === 'file' ? (
                <Input
                  id="ca_cert"
                  value={value.ca_cert || ''}
                  onChange={(e) => updateConfig({ ca_cert: e.target.value })}
                  placeholder="/path/to/ca.crt"
                  className="font-mono text-sm"
                />
              ) : (
                <Textarea
                  id="ca_cert"
                  value={value.ca_cert || ''}
                  onChange={(e) => updateConfig({ ca_cert: e.target.value })}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows={4}
                  className="font-mono text-xs"
                />
              )}
              <p className="text-xs text-[#4a6480]">
                Custom CA certificate to trust (optional, for self-signed certs)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ca_bundle" className="text-xs">
                CA Bundle Path (Alternative)
              </Label>
              <Input
                id="ca_bundle"
                value={value.ca_bundle || ''}
                onChange={(e) => updateConfig({ ca_bundle: e.target.value })}
                placeholder="/etc/ssl/certs/ca-bundle.crt"
                className="font-mono text-sm"
              />
              <p className="text-xs text-[#4a6480]">
                Path to CA bundle file with multiple certificates
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TLS Version Tab */}
      {activeTab === 'tls-version' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <Label htmlFor="min_tls_version">Minimum TLS Version</Label>
            <Select
              value={value.min_tls_version || 'TLS1.2'}
              onValueChange={(v) => updateConfig({ min_tls_version: v as any })}
            >
              <SelectTrigger id="min_tls_version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TLS_VERSIONS.map((ver) => (
                  <SelectItem key={ver.value} value={ver.value}>
                    <div className="flex items-center gap-2">
                      {ver.label}
                      {ver.recommended && (
                        <span className="text-xs text-green-400">✓ Recommended</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[#4a6480]">
              Minimum acceptable TLS version for the connection
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="max_tls_version">Maximum TLS Version</Label>
            <Select
              value={value.max_tls_version || 'TLS1.3'}
              onValueChange={(v) => updateConfig({ max_tls_version: v as any })}
            >
              <SelectTrigger id="max_tls_version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TLS_VERSIONS.map((ver) => (
                  <SelectItem key={ver.value} value={ver.value}>
                    {ver.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[#4a6480]">
              Maximum TLS version to use (usually TLS 1.3)
            </p>
          </div>

          <div className="border-t border-[#1e2d3d] pt-3" />

          <div className="space-y-3">
            <Label>Cipher Suites (Advanced)</Label>
            <div className="p-3 bg-[#0b0f18] border border-[#1a2332] rounded-lg space-y-2">
              <p className="text-xs text-[#4a6480]">
                Specify allowed cipher suites in order of preference. Leave empty to use defaults.
              </p>
              <Textarea
                value={(value.cipher_suites || []).join('\n')}
                onChange={(e) =>
                  updateConfig({
                    cipher_suites: e.target.value.split('\n').filter((s) => s.trim()),
                  })
                }
                placeholder="One cipher suite per line"
                rows={4}
                className="font-mono text-xs"
              />
            </div>

            <details className="space-y-2">
              <summary className="text-xs font-medium text-[#c8dce8] cursor-pointer">
                Common Cipher Suites
              </summary>
              <div className="pl-4 pt-2 space-y-1 text-xs font-mono">
                {COMMON_CIPHER_SUITES.map((cipher) => (
                  <div
                    key={cipher}
                    className="flex items-center justify-between p-2 bg-[#1a2332] rounded hover:bg-[#1e2d3d] cursor-pointer transition-colors"
                    onClick={() => {
                      const current = value.cipher_suites || [];
                      if (!current.includes(cipher)) {
                        updateConfig({ cipher_suites: [...current, cipher] });
                      }
                    }}
                  >
                    <span className="text-[#c8dce8]">{cipher}</span>
                    <span className="text-[10px] text-[#4a6480]">Click to add</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Verification Tab */}
      {activeTab === 'verification' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 border border-[#1e2d3d] rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="verify_ssl">Verify SSL Certificate</Label>
              <p className="text-xs text-[#4a6480]">
                Validate server certificate against trusted CAs
              </p>
            </div>
            <Switch
              id="verify_ssl"
              checked={value.verify_ssl !== false}
              onCheckedChange={(checked) => updateConfig({ verify_ssl: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 border border-[#1e2d3d] rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="verify_hostname">Verify Hostname</Label>
              <p className="text-xs text-[#4a6480]">
                Check that certificate hostname matches request URL
              </p>
            </div>
            <Switch
              id="verify_hostname"
              checked={value.verify_hostname !== false}
              onCheckedChange={(checked) => updateConfig({ verify_hostname: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="server_name">Server Name (SNI Override)</Label>
            <Input
              id="server_name"
              value={value.server_name || ''}
              onChange={(e) => updateConfig({ server_name: e.target.value })}
              placeholder="api.example.com"
              className="font-mono text-sm"
            />
            <p className="text-xs text-[#4a6480]">
              Override the Server Name Indication (SNI) sent during TLS handshake
            </p>
          </div>

          <div className="border-t border-[#1e2d3d] pt-3" />

          <div className="p-3 border border-amber-400/30 bg-amber-400/5 rounded-lg">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="allow_insecure" className="text-amber-400">
                  Allow Insecure Connections
                </Label>
                <p className="text-xs text-amber-400/70 mt-1">
                  Skip all SSL/TLS verification (not recommended for production)
                </p>
              </div>
              <Switch
                id="allow_insecure"
                checked={value.allow_insecure || false}
                onCheckedChange={(checked) => updateConfig({ allow_insecure: checked })}
              />
            </div>
            {value.allow_insecure && (
              <p className="text-xs text-amber-400/70">
                ⚠️ Warning: This disables all SSL verification and should only be used for testing
                against development/staging servers with self-signed certificates.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_auth_type">Client Authentication</Label>
            <Select
              value={value.client_auth_type || 'none'}
              onValueChange={(v) => updateConfig({ client_auth_type: v as any })}
            >
              <SelectTrigger id="client_auth_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Server doesn't request cert)</SelectItem>
                <SelectItem value="optional">Optional (Send if requested)</SelectItem>
                <SelectItem value="required">Required (Must have cert)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#4a6480]">
              How to handle server requests for client certificate
            </p>
          </div>
        </div>
      )}

      <div className="p-3 bg-[#0b0f18] border border-[#1a2332] rounded-lg">
        <div className="flex items-center gap-2 text-sm font-medium text-[#c8dce8] mb-2">
          <Info className="w-4 h-4" />
          Configuration Summary
        </div>
        <div className="space-y-1 text-xs text-[#7fa8c8]">
          {value.client_cert && (
            <div className="flex items-center gap-2">
              <Key className="w-3 h-3 text-green-400" />
              <span>Client certificate configured</span>
            </div>
          )}
          {value.ca_cert && (
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-teal-400" />
              <span>Custom CA certificate set</span>
            </div>
          )}
          {value.min_tls_version && (
            <div className="flex items-center gap-2">
              <Lock className="w-3 h-3 text-purple-400" />
              <span>
                TLS {value.min_tls_version} - {value.max_tls_version || 'TLS1.3'}
              </span>
            </div>
          )}
          {value.allow_insecure && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Insecure mode enabled (verification disabled)</span>
            </div>
          )}
          {!value.client_cert && !value.ca_cert && !value.allow_insecure && (
            <div className="text-[#4a6480]">No SSL/TLS configuration set</div>
          )}
        </div>
      </div>
    </div>
  );
}
