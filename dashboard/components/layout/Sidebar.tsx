'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  LayoutDashboard,
  FileText,
  FolderTree,
  Calendar,
  Play,
  Layers,
  ShieldCheck,
  Globe,
  Server,
  Network,
  Plug,
  BarChart3,
  Settings,
  Container,
  Puzzle,
  HeartPulse,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  items?: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Flows',
    icon: FileText,
    items: [
      { title: 'All Flows', href: '/flows', icon: FileText },
      { title: 'Collections', href: '/collections', icon: FolderTree },
      { title: 'Schedules', href: '/schedules', icon: Calendar },
    ],
  },
  {
    title: 'Executions',
    icon: Play,
    items: [
      { title: 'History', href: '/executions', icon: Play },
      { title: 'Suites', href: '/suites', icon: Layers },
      { title: 'Coverage', href: '/coverage', icon: ShieldCheck },
    ],
  },
  {
    title: 'Infrastructure',
    icon: Server,
    items: [
      { title: 'Environments', href: '/environments', icon: Globe },
      { title: 'Mock Servers', href: '/mocks', icon: Server },
      { title: 'System Graph', href: '/graph', icon: Network },
      { title: 'Integrations', href: '/integrations', icon: Plug },
    ],
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    title: 'Settings',
    icon: Settings,
    items: [
      { title: 'Test Environments', href: '/test-environments', icon: Container },
      { title: 'Plugins', href: '/plugins', icon: Puzzle },
      { title: 'Health', href: '/health', icon: HeartPulse },
    ],
  },
];

interface SidebarProps {
  mobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

function NavLink({ href, icon: Icon, title, active, onClick }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {title}
    </Link>
  );
}

export function Sidebar({ mobileMenuOpen, onMobileMenuClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach(g => {
      if (g.items) {
        initial[g.title] = g.items.some(i => pathname.startsWith(i.href));
      }
    });
    return initial;
  });

  const toggleGroup = (title: string) =>
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));

  return (
    <>
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileMenuClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'flex flex-col h-full border-r bg-sidebar w-[220px] shrink-0',
          'md:relative fixed inset-y-0 left-0 z-50',
          mobileMenuOpen ? 'flex' : 'hidden md:flex'
        )}
      >
        <ScrollArea className="flex-1 py-3">
          <nav className="px-3 space-y-0.5">
            {navGroups.map((group) => {
              if (!group.items) {
                return (
                  <NavLink
                    key={group.title}
                    href={group.href!}
                    icon={group.icon}
                    title={group.title}
                    active={isActive(group.href!)}
                    onClick={onMobileMenuClose}
                  />
                );
              }

              const isGroupActive = group.items.some(i => isActive(i.href));
              const isOpen = openGroups[group.title] ?? isGroupActive;
              const GroupIcon = group.icon;

              return (
                <Collapsible
                  key={group.title}
                  open={isOpen}
                  onOpenChange={() => toggleGroup(group.title)}
                >
                  <CollapsibleTrigger className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isGroupActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}>
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{group.title}</span>
                    <ChevronDown className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                    {group.items.map(item => (
                      <NavLink
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        title={item.title}
                        active={isActive(item.href)}
                        onClick={onMobileMenuClose}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Bottom section */}
        <div className="border-t border-sidebar-border px-3 py-3">
          {CLOUD_URL && (
            <a
              href={CLOUD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Cloud Dashboard
            </a>
          )}
        </div>
      </div>
    </>
  );
}
