'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

const searchableItems = [
  { title: 'Dashboard', href: '/', keywords: ['home', 'overview'] },
  { title: 'Flows', href: '/flows', keywords: ['tests', 'sequences'] },
  { title: 'Collections', href: '/collections', keywords: ['groups', 'folders'] },
  { title: 'Executions', href: '/executions', keywords: ['runs', 'results'] },
  { title: 'Schedules', href: '/schedules', keywords: ['cron', 'automation'] },
  { title: 'Mock Servers', href: '/mocks', keywords: ['stubs', 'virtualization'] },
  { title: 'Request Builder', href: '/request-builder', keywords: ['http', 'api', 'send'] },
  { title: 'Analytics', href: '/analytics', keywords: ['metrics', 'data'] },
  { title: 'Reports', href: '/reports', keywords: ['documentation', 'output'] },
  { title: 'Integrations', href: '/integrations', keywords: ['connections', 'providers', 'configuration'] },
  { title: 'Plugins', href: '/plugins', keywords: ['extensions', 'addons'] },
  { title: 'Health', href: '/health', keywords: ['status', 'monitoring'] },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full flex items-center h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#4a6480] hover:border-[#2a3d52] hover:text-[#7fa8c8] transition-colors"
      >
        <Search className="mr-2 h-3.5 w-3.5 shrink-0" />
        <span className="hidden lg:inline-flex">Search...</span>
        <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-0.5 rounded border border-[#2a3d52] bg-[#1a2332] px-1.5 font-mono text-[10px] font-medium text-[#4a6480] lg:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search navigation..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {searchableItems.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.title} ${item.keywords.join(' ')}`}
                onSelect={() => handleSelect(item.href)}
              >
                <Search className="mr-2 h-4 w-4" />
                <span>{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
