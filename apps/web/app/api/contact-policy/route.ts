import { NextRequest, NextResponse } from 'next/server';
import { ContactPolicyService } from '@/server/services/ContactPolicyService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const policy = new ContactPolicyService();
    if (body.action === 'discover') return NextResponse.json(await policy.canDiscoverLead(workspaceId, body.lead || {}));
    if (!body.leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    if (body.action === 'add_to_campaign') return NextResponse.json(await policy.canAddToCampaign(workspaceId, body.leadId, body.campaignId));
    if (body.action === 'draft') return NextResponse.json(await policy.canDraftEmail(workspaceId, body.leadId, body.campaignId));
    if (body.action === 'queue') return NextResponse.json(await policy.canQueueSend(workspaceId, body.leadId, body.campaignId));
    if (body.action === 'send') return NextResponse.json(await policy.canSendNow(workspaceId, body.leadId, body.campaignId));
    if (body.action === 'followup') return NextResponse.json(await policy.canScheduleFollowUp(workspaceId, body.leadId, body.campaignId));
    if (body.action === 'reengage') return NextResponse.json(await policy.canReEngageLater(workspaceId, body.leadId));
    return NextResponse.json({ error: 'Unknown policy action' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
