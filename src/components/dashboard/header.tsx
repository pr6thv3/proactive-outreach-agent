'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  Keyboard,
  ShieldCheck,
  Zap,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Info,
} from 'lucide-react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Workspace {
  id: string;
  name: string;
  domain: string;
  plan: string;
  role: string;
}

const DEFAULT_WORKSPACES: Workspace[] = [
  { id: 'org_acme', name: 'Acme SaaS Corp', domain: 'outreach.acmesaas.com', plan: 'Enterprise', role: 'Owner' },
  { id: 'org_apex', name: 'Apex Enterprise Solutions', domain: 'outreach.apexsolutions.io', plan: 'Scale', role: 'Admin' },
  { id: 'org_hypergrowth', name: 'HyperGrowth SDR Labs', domain: 'outreach.hypergrowth.ai', plan: 'Pro', role: 'Member' },
];

export function Header() {
  const { data: orgData } = useSWR('/api/org', fetcher);
  const { data: statsData } = useSWR('/api/stats', fetcher);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(DEFAULT_WORKSPACES);
  const [activeOrgId, setActiveOrgId] = useState<string>('org_acme');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const env = statsData?.data?.environment;

  // Sync with API if returned
  useEffect(() => {
    if (orgData?.data?.id) {
      setActiveOrgId(orgData.data.id);
      setWorkspaces(prev => {
        if (!prev.some(w => w.id === orgData.data.id)) {
          return [{ id: orgData.data.id, name: orgData.data.name || 'Current Workspace', domain: 'outreach.domain.com', plan: 'Pro', role: 'Owner' }, ...prev];
        }
        return prev;
      });
    }
  }, [orgData]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeOrgId) || workspaces[0];

  const handleSelectWorkspace = async (workspace: Workspace) => {
    setActiveOrgId(workspace.id);
    setDropdownOpen(false);

    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeOrgId: workspace.id }),
      });

      if (res.ok) {
        toast.success(`Switched active workspace to "${workspace.name}"`);
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        toast.error('Failed to switch active workspace');
      }
    } catch {
      toast.info(`Switched to "${workspace.name}"`);
    }
  };

  const handleCreateWorkspace = () => {
    setDropdownOpen(false);
    toast.info('To create a new isolated tenant workspace, visit Agency Admin settings.');
  };

  return (
    <div className="sticky top-0 z-30">
      {/* Sandbox / Local-Only Simulation Degradation Banner */}
      {!bannerDismissed && env && (env.isLocalOnly || env.isSandboxMode) && (
        <div
          className={`px-6 py-2 text-xs flex items-center justify-between gap-4 border-b backdrop-blur transition-all ${
            env.isLocalOnly
              ? 'bg-amber-950/90 border-amber-800/80 text-amber-200'
              : 'bg-blue-950/90 border-blue-800/80 text-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {env.isLocalOnly ? (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="h-4 w-4 text-blue-400 shrink-0" />
            )}
            <span>
              {env.isLocalOnly ? (
                <>
                  <strong className="font-semibold text-amber-300">Simulation Mode (Local Only):</strong> RESEND_API_KEY is not configured. Outbound emails are saved locally and simulated with zero live inbox delivery.
                </>
              ) : (
                <>
                  <strong className="font-semibold text-blue-300">Resend Sandbox Mode:</strong> Active sender ({env.defaultSender}) restricts outbound email delivery to your verified account email until a custom sending domain is connected.
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/dashboard/domains"
              className={`text-[11px] underline font-semibold ${
                env.isLocalOnly ? 'text-amber-300 hover:text-amber-100' : 'text-blue-300 hover:text-blue-100'
              }`}
            >
              {env.isLocalOnly ? 'Add API Key & Domain →' : 'Connect Custom Domain →'}
            </Link>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-slate-400 hover:text-slate-200 text-xs px-1"
              title="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 flex items-center justify-between gap-4">
      {/* Left: Interactive Workspace Switcher */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-750 bg-slate-950/80 hover:bg-slate-800/80 transition-all text-left shadow-sm group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Building2 className="h-4 w-4" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-100 max-w-[140px] sm:max-w-[200px] truncate">
                {activeWorkspace.name}
              </span>
              <Badge className="bg-blue-950 text-blue-300 border-blue-800 text-[9px] px-1 py-0 font-mono">
                {activeWorkspace.plan}
              </Badge>
            </div>
            <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[160px]">
              {activeWorkspace.domain}
            </span>
          </div>

          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ml-1 ${dropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute left-0 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-950 shadow-2xl p-2 z-50 animate-in fade-in-0 zoom-in-95">
            <div className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
              Switch Workspace (Tenant Scoped)
            </div>

            <div className="space-y-1">
              {workspaces.map(ws => {
                const isSelected = ws.id === activeOrgId;
                return (
                  <button
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-950/60 text-white border border-blue-800/60'
                        : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <div className="space-y-0.5 truncate">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400">{ws.role}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{ws.domain}</div>
                    </div>

                    {isSelected && <Check className="h-4 w-4 text-blue-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-800/80 mt-2 pt-1.5">
              <button
                onClick={handleCreateWorkspace}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-blue-400 hover:bg-blue-950/40 transition-colors font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Create New Workspace</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Center: Visual Keyboard Hint Badge for Review Queue */}
      <div className="hidden xl:flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-xl text-xs text-slate-300 font-mono shadow-inner">
        <Keyboard className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-slate-400 text-[11px]">5s Review Hotkeys:</span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span><kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-emerald-400 font-bold">A</kbd> Approve</span>
          <span className="text-slate-700">·</span>
          <span><kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-blue-400 font-bold">E</kbd> Edit</span>
          <span className="text-slate-700">·</span>
          <span><kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-purple-400 font-bold">G</kbd> Regen</span>
          <span className="text-slate-700">·</span>
          <span><kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-red-400 font-bold">R</kbd> Dismiss</span>
          <span className="text-slate-700">·</span>
          <span><kbd className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-300 font-bold">Space</kbd> Skip</span>
        </span>
      </div>

      {/* Right: Deliverability Heartbeat */}
      <div className="flex items-center gap-3">
        {env?.isLocalOnly ? (
          <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] hidden lg:inline-flex">
            Simulation Mode
          </Badge>
        ) : env?.isSandboxMode ? (
          <Badge className="bg-blue-950 text-blue-300 border-blue-800 text-[10px] hidden lg:inline-flex">
            Sandbox Mode
          </Badge>
        ) : null}
        <Link href="/dashboard/autonomy">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300 hover:bg-emerald-950/60 transition-colors">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold hidden sm:inline">AI SDR Autopilot</span>
            <span className="text-emerald-400/80 font-mono hidden md:inline">7-Gate Shield Active</span>
          </div>
        </Link>
      </div>
    </header>
    </div>
  );
}
