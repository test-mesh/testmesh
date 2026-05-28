'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { isCloudMode } from '@/lib/features';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserProfileMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const cloudUrl = process.env.NEXT_PUBLIC_CLOUD_URL;

  // Only show user menu in cloud mode when user is authenticated
  if (!isCloudMode || !user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Get user initials for avatar fallback
  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const initials = getInitials(user.name, user.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full flex items-center justify-center hover:ring-2 hover:ring-[#2a3d52] transition-all">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user.avatar_url} alt={user.name || user.email || 'User'} />
            <AvatarFallback className="bg-teal-400/20 text-teal-400 text-[10px] font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {user.name && (
              <p className="text-sm font-medium leading-none">{user.name}</p>
            )}
            {user.email && (
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {cloudUrl && (
          <DropdownMenuItem asChild>
            <a href={`${cloudUrl}/settings/profile`} target="_blank" rel="noopener noreferrer">
              <UserIcon className="mr-2 h-4 w-4" />
              <span>Profile</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
