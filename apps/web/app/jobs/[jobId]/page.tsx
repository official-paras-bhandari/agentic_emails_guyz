'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

function JobDetailsContent() {
  const { jobId } = useParams<{ jobId: string }>();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [data, setData] = useState<any>();
  const [error, setError] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    
    const load = async () => {
      try {
        const url = workspaceId
          ? `/api/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}`
          : `/api/jobs/${jobId}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Unable to load job');
        const next = await response.json();
        setData(next);
        if (!['completed', 'failed', 'cancelled'].includes(next.job.status)) {
          timer = setTimeout(load, 2000);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load job');
      }
    };

    load();
    return () => clearTimeout(timer);
  }, [jobId, workspaceId]);

  return (
    <div className="p-10 space-y-6">
      <h1 className="text-3xl font-bold">Job {jobId}</h1>
      {error && <p className="text-red-500">{error}</p>}
      <div className="rounded-2xl border p-5">
        <p>Status: <b>{data?.job?.status || 'loading'}</b></p>
        <p>Progress: {data?.job?.progress || 0}%</p>
        {data?.job?.failedReason && <p className="text-red-500">{data.job.failedReason}</p>}
      </div>
      <div className="space-y-2">
        {data?.logs?.map((log: any) => (
          <div key={log.id} className="rounded-xl border p-3 text-sm">{log.message}</div>
        ))}
      </div>
    </div>
  );
}

export default function JobPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading job status...
      </div>
    }>
      <JobDetailsContent />
    </Suspense>
  );
}
