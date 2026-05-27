'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Play,
  Globe,
  Server,
  Network,
  BarChart3,
  Settings,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

const primaryNav = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { title: 'Flows', href: '/flows', icon: FileText },
  { title: 'Executions', href: '/executions', icon: Play },
];

const infraNav = [
  { title: 'Environments', href: '/environments', icon: Globe },
  { title: 'Mocks', href: '/mocks', icon: Server },
  { title: 'Graph', href: '/graph', icon: Network },
];

const bottomNav = [
  { title: 'Analytics', href: '/analytics', icon: BarChart3 },
  { title: 'Settings', href: '/test-environments', icon: Settings },
];

interface SidebarProps {
  mobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

function NavItem({
  href,
  icon: Icon,
  title,
  active,
  onClick,
}: {
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
      title={title}
      className={cn(
        'group relative flex flex-col items-center gap-1 py-2.5 rounded-lg transition-colors w-full',
        active
          ? 'text-teal-400'
          : 'text-[#3d5670] hover:text-[#7fa8c8]'
      )}
    >
      {/* Active left accent */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-teal-400 rounded-r-full" />
      )}
      <Icon
        className={cn(
          'w-[18px] h-[18px] shrink-0 transition-colors',
          active ? 'text-teal-400' : 'group-hover:text-[#7fa8c8]'
        )}
      />
      <span
        className={cn(
          'text-[9px] font-medium tracking-wide leading-none',
          active ? 'text-teal-400' : 'text-[#3d5670] group-hover:text-[#7fa8c8]'
        )}
      >
        {title}
      </span>
    </Link>
  );
}

function Divider() {
  return <div className="h-px bg-[#1a2332] mx-3 my-1" />;
}

export function Sidebar({ mobileMenuOpen, onMobileMenuClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/') || (href !== '/' && pathname.startsWith(href));

  return (
    <>
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onMobileMenuClose}
        />
      )}

      <div
        className={cn(
          'flex flex-col h-full shrink-0 w-[68px]',
          'bg-[#0b0f18] border-r border-[#1a2332]',
          'md:relative fixed inset-y-0 left-0 z-50',
          mobileMenuOpen ? 'flex' : 'hidden md:flex'
        )}
      >
        {/* Primary nav */}
        <nav className="flex flex-col gap-0.5 px-2 pt-3">
          {primaryNav.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              title={item.title}
              active={isActive(item.href, item.exact)}
              onClick={onMobileMenuClose}
            />
          ))}
        </nav>

        <Divider />

        {/* Infrastructure nav */}
        <nav className="flex flex-col gap-0.5 px-2">
          {infraNav.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              title={item.title}
              active={isActive(item.href)}
              onClick={onMobileMenuClose}
            />
          ))}
        </nav>

        {/* Push bottom nav to bottom */}
        <div className="flex-1" />

        <Divider />

        {/* Bottom nav */}
        <nav className="flex flex-col gap-0.5 px-2 pb-3">
          {bottomNav.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              title={item.title}
              active={isActive(item.href)}
              onClick={onMobileMenuClose}
            />
          ))}

          {CLOUD_URL && (
            <a
              href={CLOUD_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Cloud Dashboard"
              className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-[#3d5670] hover:text-[#7fa8c8] transition-colors"
            >
              <ExternalLink className="w-[18px] h-[18px] shrink-0" />
              <span className="text-[9px] font-medium tracking-wide">Cloud</span>
            </a>
          )}

          <a
            href="https://docs.testmesh.io"
            target="_blank"
            rel="noopener noreferrer"
            title="Documentation"
            className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-[#3d5670] hover:text-[#7fa8c8] transition-colors"
          >
            <HelpCircle className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[9px] font-medium tracking-wide">Docs</span>
          </a>
        </nav>
      </div>
    </>
  );
}
