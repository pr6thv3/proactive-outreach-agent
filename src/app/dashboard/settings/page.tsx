import { TeamInvite } from '@/components/dashboard/team-invite';
import { AuditLogViewer } from '@/components/dashboard/audit-log-viewer';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Team & Workspace Settings</h2>
        <p className="text-slate-400 text-sm">Manage team access, RBAC roles, and security audit logs.</p>
      </div>

      <TeamInvite />
      <AuditLogViewer />
    </div>
  );
}
