'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkspaceSwitcher } from '@/components/workspaces/WorkspaceSwitcher';
import { EnvironmentSelector } from '@/components/environments/EnvironmentSelector';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { UserProfileMenu } from '@/components/user/UserProfileMenu';

interface TopNavHeaderProps {
  onMenuClick?: () => void;
}

export function TopNavHeader({ onMenuClick }: TopNavHeaderProps) {
  return (
    <header className="sticky top-0 z-50 h-16 border-b bg-background">
      <div className="flex h-full items-center px-4 gap-4">
        {/* Mobile: Hamburger menu */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Left: Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              TM
            </div>
            <span className="hidden sm:inline">TestMesh</span>
          </Link>
        </div>

        {/* Middle: Workspace + Environment selectors (Desktop only) */}
        <div className="hidden md:flex items-center gap-3">
          <WorkspaceSwitcher className="w-48" compact={false} />
          <EnvironmentSelector className="w-40" compact={false} />
        </div>

        {/* Right: Search + Notifications + Profile */}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block w-64">
            <GlobalSearch />
          </div>
          <NotificationCenter />
          <UserProfileMenu />
        </div>
      </div>
    </header>
  );
}
