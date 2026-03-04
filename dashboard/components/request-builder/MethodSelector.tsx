'use client';

import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { HttpMethod } from './types';

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-600 dark:text-green-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-yellow-600 dark:text-yellow-400',
  DELETE: 'text-red-600 dark:text-red-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
  HEAD: 'text-gray-600 dark:text-gray-400',
  OPTIONS: 'text-gray-600 dark:text-gray-400',
};

interface MethodSelectorProps {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
  className?: string;
}

export default function MethodSelector({ value, onChange, className }: MethodSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as HttpMethod)}>
      <SelectTrigger className={cn('w-28 font-mono font-semibold', methodColors[value], className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="GET" className="font-mono font-semibold text-green-600 dark:text-green-400">
          GET
        </SelectItem>
        <SelectItem value="POST" className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          POST
        </SelectItem>
        <SelectItem value="PUT" className="font-mono font-semibold text-yellow-600 dark:text-yellow-400">
          PUT
        </SelectItem>
        <SelectItem value="DELETE" className="font-mono font-semibold text-red-600 dark:text-red-400">
          DELETE
        </SelectItem>
        <SelectItem value="PATCH" className="font-mono font-semibold text-purple-600 dark:text-purple-400">
          PATCH
        </SelectItem>
        <SelectItem value="HEAD" className="font-mono font-semibold text-gray-600 dark:text-gray-400">
          HEAD
        </SelectItem>
        <SelectItem value="OPTIONS" className="font-mono font-semibold text-gray-600 dark:text-gray-400">
          OPTIONS
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
