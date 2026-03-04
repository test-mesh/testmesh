'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNavHeader } from './TopNavHeader';
import { usePathname } from 'next/navigation';

// Pages that should NOT show the sidebar/header (e.g., login)
const noLayoutPaths = ['/login', '/login/callback'];

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const showLayout = !noLayoutPaths.some(path => pathname.startsWith(path));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!showLayout) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNavHeader onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          mobileMenuOpen={mobileMenuOpen}
          onMobileMenuClose={() => setMobileMenuOpen(false)}
        />
        <main className="flex-1 overflow-auto px-4">
          {children}
        </main>
      </div>
    </div>
  );
}
