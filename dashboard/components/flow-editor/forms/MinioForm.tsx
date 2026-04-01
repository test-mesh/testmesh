'use client';

import { HardDrive } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface MinioFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  action?: string;
  className?: string;
}

export default function MinioForm({
  config,
  onChange,
  action,
  className,
}: MinioFormProps) {
  const isPut = action === 'minio.put';
  const isGet = action === 'minio.get';
  const isAssert = action === 'minio.assert';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <HardDrive className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">MinIO</span>
        {action && (
          <span className="text-xs text-muted-foreground font-mono">({action})</span>
        )}
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="minio-endpoint">Endpoint</Label>
            <Input
              id="minio-endpoint"
              value={(config.endpoint as string) || ''}
              onChange={(e) => onChange('endpoint', e.target.value)}
              placeholder="localhost:9000"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-access-key">Access Key</Label>
            <Input
              id="minio-access-key"
              value={(config.access_key as string) || ''}
              onChange={(e) => onChange('access_key', e.target.value)}
              placeholder="minioadmin"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-secret-key">Secret Key</Label>
            <Input
              id="minio-secret-key"
              type="password"
              value={(config.secret_key as string) || ''}
              onChange={(e) => onChange('secret_key', e.target.value)}
              placeholder="${MINIO_SECRET_KEY}"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Use SSL</Label>
            <Switch
              checked={(config.use_ssl as boolean) || false}
              onCheckedChange={(checked) => onChange('use_ssl', checked)}
            />
          </div>
        </div>
      </details>

      {/* Bucket */}
      <div className="space-y-2">
        <Label htmlFor="minio-bucket">Bucket</Label>
        <Input
          id="minio-bucket"
          value={(config.bucket as string) || ''}
          onChange={(e) => onChange('bucket', e.target.value)}
          placeholder="my-bucket"
          className="font-mono text-sm"
        />
      </div>

      {/* Object */}
      <div className="space-y-2">
        <Label htmlFor="minio-object">Object</Label>
        <Input
          id="minio-object"
          value={(config.object as string) || ''}
          onChange={(e) => onChange('object', e.target.value)}
          placeholder="path/to/file.json"
          className="font-mono text-sm"
        />
      </div>

      {/* minio.put: data + content_type */}
      {isPut && (
        <>
          <div className="space-y-2">
            <Label htmlFor="minio-data">Data</Label>
            <Textarea
              id="minio-data"
              value={(config.data as string) || ''}
              onChange={(e) => onChange('data', e.target.value)}
              placeholder='{"key":"value"}'
              rows={5}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-content-type">Content Type</Label>
            <Input
              id="minio-content-type"
              value={(config.content_type as string) || ''}
              onChange={(e) => onChange('content_type', e.target.value)}
              placeholder="application/json"
              className="font-mono text-sm"
            />
          </div>
        </>
      )}

      {/* minio.get: as */}
      {isGet && (
        <div className="space-y-2">
          <Label htmlFor="minio-as">Read As</Label>
          <Select
            value={(config.as as string) || 'text'}
            onValueChange={(v) => onChange('as', v)}
          >
            <SelectTrigger id="minio-as">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="base64">Base64</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* minio.assert: exists */}
      {isAssert && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Object Exists</Label>
            <p className="text-xs text-muted-foreground">Assert that the object exists in the bucket</p>
          </div>
          <Switch
            checked={(config.exists as boolean) !== false}
            onCheckedChange={(checked) => onChange('exists', checked)}
          />
        </div>
      )}
    </div>
  );
}
