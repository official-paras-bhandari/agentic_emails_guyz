'use client';

import { useEffect, useState } from 'react';

type AuditLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
};

export default function AuditCenterPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/audit', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load audit logs');
        setLogs(await response.json());
      })
      .catch(error => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Center</h1>
        <p className="text-zinc-500">Security, policy and workflow events.</p>
      </div>
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-500">{error}</div>}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-900 text-left">
            <tr><th className="p-3">Time</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Details</th></tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="p-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="p-3 font-medium">{log.action}</td>
                <td className="p-3"><div>{log.entityType}</div><div className="text-xs text-zinc-500">{log.entityId}</div></td>
                <td className="p-3 font-mono text-xs max-w-xl break-all">{JSON.stringify(log.details)}</td>
              </tr>
            ))}
            {!logs.length && !error && <tr><td className="p-8 text-center text-zinc-500" colSpan={4}>No audit events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
