/**
 * Header Component
 */

'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserMenu from './user-menu';

interface HeaderProps {
  onToggleSidebar: () => void;
  children?: React.ReactNode;
}

export default function Header({ onToggleSidebar, children }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-4">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Right side content */}
      <div className="flex items-center gap-4">
        {children}
        <UserMenu />
      </div>
    </header>
  );
}

