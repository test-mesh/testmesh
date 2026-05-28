'use client';

import { Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import KeyValueEditor from './KeyValueEditor';
import type { KeyValuePair } from '../types';
import { generatePairId } from '../types';

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
    const exists = headers.some((h) => h.key.toLowerCase() === header.key.toLowerCase());
    if (exists) {
      onChange(
        headers.map((h) =>
          h.key.toLowerCase() === header.key.toLowerCase()
            ? { ...h, value: header.value, enabled: true }
            : h
        )
      );
    } else {
      onChange([...headers, { id: generatePairId(), key: header.key, value: header.value, enabled: true }]);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-[#4a6480]">HTTP headers to include with the request</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 h-7 px-2 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">
              <Plus className="w-3 h-3" />
              Common Headers
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {COMMON_HEADERS.map((header) => (
              <DropdownMenuItem key={header.key} onClick={() => addCommonHeader(header)}>
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
