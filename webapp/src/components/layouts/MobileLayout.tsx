/**
 * Shell layout for mobile-first roles: COACH, STUDENT, PARENT.
 * Top bar + bottom navigation bar. Content scrolls between them.
 * On desktop (lg+), the bottom nav hides and the content expands.
 */

import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

export function MobileLayout() {
  return (
    <div className="flex h-screen flex-col bg-brand-background">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4 pb-20 lg:pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
