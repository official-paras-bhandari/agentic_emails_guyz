import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

function buildFallbackDraft(reply: { lead: { businessName?: string | null }; content: string }) {
  const name = reply.lead.businessName || 'there';
  return {
    subject: `Re: ${reply.lead.businessName || 'your message'}`,
    body: [
      `Hi ${name},`,
      '',
      'Thanks for getting back to us.',
      '',
      'I read your message and wanted to respond with something helpful and clear.',
      '',
      'If you want, I can tailor this further based on tone, urgency, or the next step you want to take.',
      '',
      'Best,'
    ].join('\n')
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ replyId: string }> }) {
  try {
    const { replyId } = await params;
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const instruction = typeof body.instruction === 'string' && body.instruction.trim()
      ? body.instruction.trim()
      : 'Draft a concise, helpful customer reply that sounds natural, confident, and business-aware.';

    const reply = await prisma.reply.findFirst({
      where: { id: replyId, workspaceId },
      include: { lead: true }
    });
    if (!reply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 });

    const workerUrl = process.env.WORKER_URL || 'http://localhost:8000';
    const internalKey = process.env.INTERNAL_API_KEY || '';

    try {
      const response = await fetch(`${workerUrl}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': internalKey },
        body: JSON.stringify({
          workspace_id: workspaceId,
          lead_id: reply.leadId,
          campaign_id: null,
          original_subject: `Re: ${reply.lead.businessName || 'your message'}`,
          original_body: reply.content,
          instruction: `Write a reply to the customer based on this inbound email. ${instruction}`,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (response.ok) {
        const result = await response.json();
        return NextResponse.json({
          subject: result.subject || `Re: ${reply.lead.businessName || 'your message'}`,
          body: result.body || buildFallbackDraft(reply).body,
        });
      }
    } catch (error) {
      console.warn('[reply draft] worker rewrite failed', error);
    }

    return NextResponse.json(buildFallbackDraft(reply));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) });
  }
}
