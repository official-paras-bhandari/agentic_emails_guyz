import Link from 'next/link';
export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <div className="p-10 space-y-4"><h1 className="text-2xl font-bold">Chat session</h1><p className="font-mono text-sm text-zinc-500">{sessionId}</p><p>Session history is available through the chat API.</p><Link className="text-blue-500" href="/chat">Open chat</Link></div>;
}
