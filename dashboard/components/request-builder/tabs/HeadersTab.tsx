'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import KeyValueEditor from './KeyValueEditor';
import type { KeyValuePair } from '../types';
import { generatePairId } from '../types';

// Common headers for quick add
const COMMON_HEADERS = [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Accept', value: 'application/json' },
  { key: 'Accept-Language', value: 'en-US,en;q=0.9' },
  { key: 'Cache-Control', value: 'no-cache' },
  { key: 'User-Agent', value: 'TestMesh/1.0' },
  { key: 'X-Request-ID', value: '${RANDOM_ID}' },
];

interface HeadersTabProps {
  headers: KeyValuePair[];
  onChange: (headers: KeyValuePair[]) => void;
}

export default function HeadersTab({ headers, onChange }: HeadersTabProps) {
  const addCommonHeader = (header: { key: string; value: string }) => {
    // Check if header already exists
    const exists = headers.some((h) => h.key.toLowerCase() === header.key.toLowerCase());
    if (exists) {
      // Update existing header
      onChange(
        headers.map((h) =>
          h.key.toLowerCase() === header.key.toLowerCase()
            ? { ...h, value: header.value, enabled: true }
            : h
        )
      );
    } else {
      // Add new header
      onChange([
        ...headers,
        {
          id: generatePairId(),
          key: header.key,
          value: header.value,
          enabled: true,
        },
      ]);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          HTTP headers to include with the request
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Common Headers
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {COMMON_HEADERS.map((header) => (
              <DropdownMenuItem
                key={header.key}
                onClick={() => addCommonHeader(header)}
              >
                <span className="font-mono text-xs">{header.key}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <KeyValueEditor
        pairs={headers}
        onChange={onChange}
        keyPlaceholder="Header"
        valuePlaceholder="Value"
        showDescription
      />
    </div>
  );
}
