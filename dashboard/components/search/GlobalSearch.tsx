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
import { Button } from '@/components/ui/button';

// Navigation items for search — matches sidebar navigation
const searchableItems = [
  // Overview
  { title: 'Dashboard', href: '/', keywords: ['home', 'overview'] },

  // Flow authoring & organization
  { title: 'Flows', href: '/flows', keywords: ['tests', 'sequences'] },
  { title: 'Collections', href: '/collections', keywords: ['groups', 'folders'] },

  // Execution
  { title: 'Executions', href: '/executions', keywords: ['runs', 'results'] },
  { title: 'Schedules', href: '/schedules', keywords: ['cron', 'automation'] },

  // Test infrastructure
  { title: 'Mock Servers', href: '/mocks', keywords: ['stubs', 'virtualization'] },

  // Development tools
  { title: 'Request Builder', href: '/request-builder', keywords: ['http', 'api', 'send'] },
  // Insights
  { title: 'Analytics', href: '/analytics', keywords: ['metrics', 'data'] },
  { title: 'Reports', href: '/reports', keywords: ['documentation', 'output'] },

  // Administration
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
      <Button
        variant="outline"
        className="relative w-full justify-start text-sm text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search...</span>
        <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 lg:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

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
