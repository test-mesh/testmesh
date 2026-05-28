'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
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
    <header className="sticky top-0 z-50 h-12 shrink-0 border-b border-[#1a2332] bg-[#0b0f18]">
      <div className="flex h-full items-center px-4 gap-3">
        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center h-8 w-8 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-400 text-[#0b0f18] text-[11px] font-bold">
            TM
          </div>
          <span className="hidden sm:inline text-[13px] font-semibold text-[#c8dce8] tracking-tight">
            TestMesh
          </span>
        </Link>

        {/* Workspace + environment (compact) */}
        <div className="hidden md:flex items-center gap-2 ml-2">
          <WorkspaceSwitcher className="h-7 text-xs" compact />
          <EnvironmentSelector className="h-7 text-xs" compact />
        </div>

        {/* Search — pushed right */}
        <div className="ml-auto hidden lg:block w-60">
          <GlobalSearch />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-2">
          <NotificationCenter />
          <UserProfileMenu />
        </div>
      </div>
    </header>
  );
}
