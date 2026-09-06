import { SignalFeed } from '@/components/dashboard/signal-feed';

export default function SignalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Intent Signal Intelligence</h2>
        <p className="text-slate-400 text-sm">Real-time buying signals (funding rounds, job postings, tech stack changes) powering lead scoring.</p>
      </div>

      <SignalFeed />
    </div>
  );
}
