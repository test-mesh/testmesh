'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  FileText,
  Play,
  FolderTree,
  Server,
  FileCode,
  Calendar,
  Gauge,
  BarChart3,
  FileBarChart,
  Sparkles,
  Puzzle,
  Activity,
  Upload,
  Terminal,
  History,
  ChevronLeft,
  ChevronRight,
  Settings,
  Plug,
  Users,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

// Flat navigation list organized by workflow order
const navigation: NavItem[] = [
  // Core Overview
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Activity', href: '/activity', icon: Activity },

  // Testing Workflow
  { title: 'Flows', href: '/flows', icon: FileText },
  { title: 'Executions', href: '/executions', icon: Play },
  { title: 'Collections', href: '/collections', icon: FolderTree },
  { title: 'Schedules', href: '/schedules', icon: Calendar },
  { title: 'Runner', href: '/runner', icon: Terminal },

  // Infrastructure
  { title: 'Mock Servers', href: '/mocks', icon: Server },
  { title: 'Contracts', href: '/contracts', icon: FileCode },
  { title: 'Load Testing', href: '/load-testing', icon: Gauge },

  // Insights
  { title: 'Analytics', href: '/analytics', icon: BarChart3 },
  { title: 'Reports', href: '/reports', icon: FileBarChart },
  { title: 'History', href: '/history', icon: History },

  // AI & Extensions
  { title: 'AI Features', href: '/ai', icon: Sparkles },
  { title: 'Plugins', href: '/plugins', icon: Puzzle },
  { title: 'Import', href: '/import', icon: Upload },

  // Administration
  { title: 'Admin Dashboard', href: '/admin', icon: Settings },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Integrations', href: '/admin/integrations', icon: Plug },
  { title: 'Health', href: '/admin/health', icon: Activity },
];

interface SidebarProps {
  mobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

export function Sidebar({ mobileMenuOpen, onMobileMenuClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
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
          'flex flex-col h-full border-r bg-background transition-all duration-300',
          // Desktop
          'hidden md:flex',
          collapsed ? 'w-16' : 'w-64',
          // Mobile (overlay)
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
              <Link key={item.href} href={item.href} onClick={onMobileMenuClose}>
                <Button
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full',
                    collapsed ? 'justify-center px-2' : 'justify-start',
                    active && 'bg-secondary'
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <Icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                  {!collapsed && <span>{item.title}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

        {/* Collapse Toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
