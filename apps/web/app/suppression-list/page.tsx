'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SuppressionContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [items, setItems] = useState<any[]>([]);
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<'email' | 'domain'>('email');
  const [error, setError] = useState('');

  const load = () => {
    const url = workspaceId 
      ? `/api/suppression-list?workspaceId=${encodeURIComponent(workspaceId)}` 
      : '/api/suppression-list';

    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error('Unable to load suppression list');
        setItems(await r.json());
        setError('');
      })
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/suppression-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          [kind]: value, 
          reason: 'Manual suppression',
          workspaceId 
        })
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Failed to add suppression');
        return;
      }
      setValue('');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to add suppression');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this suppression entry? Historical replies and send records will remain.')) return;
    try {
      const r = await fetch('/api/suppression-list', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, confirmed: true, workspaceId })
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || 'Failed to remove suppression');
      }
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to remove suppression');
    }
  };

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Suppression List</h1>
        <p className="text-zinc-500">
          Email and domain blocks enforced across discovery, drafting, sending, and follow-ups.
        </p>
      </div>
      
      <form onSubmit={add} className="flex gap-2">
        <select 
          value={kind} 
          onChange={e => setKind(e.target.value as any)} 
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
        >
          <option value="email">Email</option>
          <option value="domain">Domain</option>
        </select>
        <input 
          required 
          value={value} 
          onChange={e => setValue(e.target.value)} 
          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500" 
          placeholder={kind === 'email' ? 'example@domain.com' : 'domain.com'}
        />
        <button className="rounded-xl bg-red-650 hover:bg-red-600 px-5 text-white font-semibold text-sm transition-colors">
          Suppress
        </button>
      </form>
      
      {error && <p className="text-red-500 font-medium">{error}</p>}
      
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/50">
              <th className="p-4 text-left font-semibold text-zinc-500">Target</th>
              <th className="p-4 text-left font-semibold text-zinc-500">Reason</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(x => (
              <tr key={x.id} className="border-t border-zinc-150 dark:border-zinc-800/80 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                <td className="p-4 font-mono text-zinc-700 dark:text-zinc-300">{x.email || x.domain}</td>
                <td className="p-4 text-zinc-650 dark:text-zinc-400">{x.reason || '—'}</td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => remove(x.id)} 
                    className="text-red-500 hover:text-red-600 font-medium transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={3} className="p-12 text-center text-zinc-500 font-medium bg-zinc-50/50 dark:bg-zinc-900/50">
                  No suppression entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SuppressionPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading suppression list...
      </div>
    }>
      <SuppressionContent />
    </Suspense>
  );
}
