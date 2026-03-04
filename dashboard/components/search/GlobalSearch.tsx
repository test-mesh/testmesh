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

// Navigation items for search
const searchableItems = [
  // Overview
  { title: 'Dashboard', href: '/', keywords: ['home', 'overview'] },
  { title: 'Activity', href: '/activity', keywords: ['recent', 'history'] },

  // Admin
  { title: 'Admin Dashboard', href: '/admin', keywords: ['settings', 'configuration'] },
  { title: 'Users', href: '/admin/users', keywords: ['team', 'members'] },
  { title: 'Integrations', href: '/admin/integrations', keywords: ['connections', 'plugins'] },
  { title: 'Health', href: '/admin/health', keywords: ['status', 'monitoring'] },

  // Testing
  { title: 'Flows', href: '/flows', keywords: ['tests', 'sequences'] },
  { title: 'Executions', href: '/executions', keywords: ['runs', 'results'] },
  { title: 'Collections', href: '/collections', keywords: ['groups', 'folders'] },
  { title: 'Schedules', href: '/schedules', keywords: ['cron', 'automation'] },
  { title: 'Runner', href: '/runner', keywords: ['execute', 'terminal'] },

  // Infrastructure
  { title: 'Mock Servers', href: '/mocks', keywords: ['stubs', 'virtualization'] },
  { title: 'Contracts', href: '/contracts', keywords: ['specifications', 'api'] },
  { title: 'Load Testing', href: '/load-testing', keywords: ['performance', 'stress'] },

  // Insights
  { title: 'Analytics', href: '/analytics', keywords: ['metrics', 'data'] },
  { title: 'Reports', href: '/reports', keywords: ['documentation', 'output'] },
  { title: 'History', href: '/history', keywords: ['logs', 'audit'] },

  // AI & Integrations
  { title: 'AI Features', href: '/ai', keywords: ['ml', 'intelligence'] },
  { title: 'Plugins', href: '/plugins', keywords: ['extensions', 'addons'] },
  { title: 'Import', href: '/import', keywords: ['upload', 'migrate'] },
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
