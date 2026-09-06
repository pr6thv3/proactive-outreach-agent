'use client';

import { Toaster } from 'sonner';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Toaster position="top-right" theme="dark" />

      {/* Global Dashboard Sidebar */}
      <Sidebar />

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Global Dashboard Header with Workspace Switcher & Hotkey Hints */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
