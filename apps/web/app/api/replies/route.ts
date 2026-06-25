import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { ReplySyncService } from '@/server/services/ReplySyncService';
import { GmailService } from '@/server/services/GmailService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const HUMAN_REPLY_CLASSES = new Set(['needs_human_reply', 'unknown', 'interested']);
const RESOLVED_CLASSES = new Set(['auto_reply', 'bounce', 'unsubscribe', 'not_interested']);

async function enrichReplies(workspaceId: string) {
  const replies = await prisma.reply.findMany({
    where: { workspaceId },
    include: { lead: true },
    orderBy: { receivedAt: 'desc' },
    take: 100
  });

  let gmail: GmailService | null = null;
  try {
    gmail = new GmailService();
    await gmail.initializeForWorkspace(workspaceId);
  } catch {
    gmail = null;
  }

  const enriched = [];
  for (const reply of replies) {
    const receivedAt = new Date(reply.receivedAt);
    const ageMinutes = Math.max(0, Math.floor((Date.now() - receivedAt.getTime()) / 60_000));
    let userReplied = false;

    if (gmail && reply.threadId) {
      try {
        const thread = await gmail.getThread(reply.threadId);
        userReplied = (thread.messages || []).some((message: any) => {
          const labels = Array.isArray(message.labelIds) ? message.labelIds : [];
          const internalDate = Number(message.internalDate || 0);
          return labels.includes('SENT') && internalDate > receivedAt.getTime();
        });
      } catch {
        userReplied = false;
      }
    }

    const needsAttention = !userReplied && HUMAN_REPLY_CLASSES.has(reply.classification) && ageMinutes >= 30;
    const state = userReplied
      ? 'handled'
      : RESOLVED_CLASSES.has(reply.classification)
        ? 'auto_resolved'
        : needsAttention
          ? 'needs_reply'
          : 'waiting';

    enriched.push({
      ...reply,
      ageMinutes,
      userReplied,
      needsAttention,
      state,
    });
  }

  return enriched;
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const scope = req.nextUrl.searchParams.get('scope') || 'all';
    const replies = await enrichReplies(workspaceId);
    const filtered = scope === 'open'
      ? replies.filter(reply => reply.state === 'needs_reply' || reply.state === 'waiting')
      : scope === 'waiting'
        ? replies.filter(reply => reply.state === 'waiting')
        : scope === 'handled'
          ? replies.filter(reply => reply.state === 'handled' || reply.state === 'auto_resolved')
          : replies;
    return NextResponse.json(filtered);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
export async function POST(req: NextRequest) {
  try { const body = await req.json(); const workspaceId = requireWorkspace(req, body.workspaceId); if (!body.leadId || typeof body.content !== 'string') return NextResponse.json({ error: 'leadId and content are required' }, { status: 400 }); const service = new ReplySyncService(); return NextResponse.json(await service.ingestReply(workspaceId, body.leadId, body.threadId || `manual-${Date.now()}`, body.content, body.classification, body.messageId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
