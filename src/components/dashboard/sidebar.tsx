'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  CheckSquare,
  Inbox,
  Send,
  Target,
  ShieldCheck,
  Settings,
  Key,
  ShieldAlert,
  Sparkles,
  Zap,
  Users,
  Upload,
  Radio,
  Bot,
  TrendingUp,
  Building2,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: any;
  badge?: string;
  badgeColor?: string;
}

export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { name: 'Pipeline Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Autopilot Control', href: '/dashboard/autonomy', icon: Zap, badge: 'Live', badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  { name: 'AI Prospect Discovery', href: '/dashboard/prospects', icon: Search, badge: 'New', badgeColor: 'bg-purple-950 text-purple-300 border-purple-800' },
  { name: '5s Review Queue', href: '/dashboard/review', icon: CheckSquare, badge: 'Review', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800' },
  { name: 'AI Smart Inbox', href: '/dashboard/inbox', icon: Inbox, badge: '2', badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  { name: 'Leads Directory', href: '/dashboard/leads', icon: Users },
  { name: 'Lead CSV Import', href: '/dashboard/leads/import', icon: Upload },
  { name: 'Intent Signals', href: '/dashboard/signals', icon: Sparkles, badge: 'Live', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800' },
  { name: 'Campaigns & Sequences', href: '/dashboard/campaigns', icon: Send },
  { name: 'Targeting & ICP', href: '/dashboard/icp', icon: Target },
  { name: 'Domains & Deliverability', href: '/dashboard/domains', icon: ShieldCheck },
  { name: 'Mailbox Simulator', href: '/dashboard/simulator', icon: Bot, badge: 'Demo', badgeColor: 'bg-amber-950 text-amber-300 border-amber-800' },
  { name: 'Analytics & Funnel', href: '/dashboard/analytics', icon: TrendingUp },
  { name: 'Team Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'API Keys', href: '/dashboard/settings/api', icon: Key },
  { name: 'Agency Admin', href: '/admin', icon: ShieldAlert },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col justify-between p-4 min-h-screen">
      <div className="space-y-5">
        {/* Brand Logo Header */}
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 group">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-900/50 group-hover:scale-105 transition-transform">
            PR
          </div>
          <div>
            <h1 className="font-bold text-base leading-none text-slate-100 flex items-center gap-1">
              ProactiveReach
            </h1>
            <span className="text-[10px] text-blue-400 font-semibold tracking-wide flex items-center gap-1 mt-0.5">
              <Sparkles className="h-2.5 w-2.5" /> AUTONOMOUS AI SDR
            </span>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {SIDEBAR_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-950/50'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border ${
                      isActive
                        ? 'bg-blue-800 text-white border-blue-700'
                        : item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Tenant Info */}
      <div className="border-t border-slate-800 pt-4 space-y-2 mt-4">
        <Link href="/dashboard/settings" className="block">
          <div className="px-2.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-blue-400" />
                Acme SaaS Corp
              </span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
              outreach.acmesaas.com (Active)
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
