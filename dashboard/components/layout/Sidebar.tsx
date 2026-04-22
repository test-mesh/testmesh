'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  FileText,
  Play,
  FolderTree,
  Server,
  Calendar,
  BarChart3,
  Send,
  ExternalLink,
  Plug,
  Puzzle,
  HeartPulse,
  Network,
  ShieldCheck,
  Layers,
  Container,
} from 'lucide-react';

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

// Flat navigation list organized by workflow order
const navigation: NavItem[] = [
  // Overview
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },

  // Flow authoring & organization
  { title: 'Flows', href: '/flows', icon: FileText },
  { title: 'Collections', href: '/collections', icon: FolderTree },

  // Execution
  { title: 'Executions', href: '/executions', icon: Play },
  { title: 'Coverage', href: '/coverage', icon: ShieldCheck },
  { title: 'Suites', href: '/suites', icon: Layers },
  { title: 'Test Environments', href: '/test-environments', icon: Container },
  { title: 'Schedules', href: '/schedules', icon: Calendar },

  // Test infrastructure
  { title: 'Mock Servers', href: '/mocks', icon: Server },
  { title: 'Graph', href: '/graph', icon: Network },

  // Development tools
  { title: 'Request Builder', href: '/request-builder', icon: Send },

  // Insights
  { title: 'Analytics', href: '/analytics', icon: BarChart3 },

  // Administration
  { title: 'Integrations', href: '/integrations', icon: Plug },
  { title: 'Plugins', href: '/plugins', icon: Puzzle },
  { title: 'Health', href: '/health', icon: HeartPulse },
];

interface SidebarProps {
  mobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

export function Sidebar({ mobileMenuOpen, onMobileMenuClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <>
        {/* Mobile overlay backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onMobileMenuClose}
          />
        )}

        {/* Sidebar */}
        <div
          className={cn(
            'flex flex-col h-full border-r bg-background w-20',
            'hidden md:flex',
            'md:relative fixed inset-y-0 left-0 z-50',
            mobileMenuOpen ? 'flex' : 'hidden md:flex'
          )}
        >
          {/* Navigation */}
          <ScrollArea className="flex-1">
            <nav className="space-y-0.5 px-2 py-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link href={item.href} onClick={onMobileMenuClose}>
                        <Button
                          variant={active ? 'secondary' : 'ghost'}
                          className={cn(
                            'w-full justify-center px-2',
                            active && 'bg-secondary'
                          )}
                        >
                          <Icon className="h-7 w-7" />
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Cloud dashboard link — only shown in SaaS mode */}
          {CLOUD_URL && (
            <div className="px-2 py-2 border-t border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={CLOUD_URL} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" className="w-full justify-center px-2">
                      <ExternalLink className="h-5 w-5" />
                    </Button>
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Cloud Dashboard
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </>
    </TooltipProvider>
  );
}
