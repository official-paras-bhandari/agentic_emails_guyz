import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));

    const [
      activeCampaignsCount,
      totalSentEmails,
      replies,
      bouncedCount,
      totalLeads
    ] = await Promise.all([
      prisma.campaign.count({ where: { workspaceId, status: 'active' } }),
      prisma.sentEmail.count({ where: { workspaceId, deliveryStatus: 'sent' } }),
      prisma.reply.count({ where: { workspaceId } }),
      prisma.suppressionEntry.count({ where: { workspaceId, reason: 'bounced' } }),
      prisma.lead.count({ where: { workspaceId } })
    ]);

    const overallReplyRate = totalSentEmails > 0 ? (replies / totalSentEmails) * 100 : 0;

    return NextResponse.json({
      activeCampaigns: activeCampaignsCount,
      totalSentEmails,
      totalReplies: replies,
      overallReplyRate: parseFloat(overallReplyRate.toFixed(2)),
      bouncedCount,
      totalLeads
    });
  } catch (error: any) {
    console.error('Metrics Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: securityErrorStatus(error) }
    );
  }
}

