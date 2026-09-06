export const dynamic = 'force-dynamic';

import { IcpEditor } from '@/components/dashboard/icp-editor';

export default function IcpPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <IcpEditor />
    </div>
  );
}
