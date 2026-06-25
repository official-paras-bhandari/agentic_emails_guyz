import { prisma } from '@packages/db';
import { GmailService } from './GmailService';
import { AuditLogService } from './AuditLogService';
import { SuppressionService } from './SuppressionService';

const audit = new AuditLogService();
const suppression = new SuppressionService();

type Classification = 'interested' | 'not_interested' | 'unsubscribe' | 'bounce' | 'auto_reply' | 'needs_human_reply' | 'unknown';

export class ReplySyncService {
  async syncReplies(workspaceId: string) {
    const gmail = new GmailService();
    try { await gmail.initializeForWorkspace(workspaceId); }
    catch { return { synced: 0, error: 'Gmail not connected' }; }
    let synced = 0;
    // Page through Gmail threads instead of relying on a hard 20-thread cap.
    // Do not rely on Gmail's unread flag. If the user opens the reply in Gmail first,
    // the message becomes read and would otherwise never reach the app.
    let pageToken: string | undefined;
    do {
      const page = await gmail.listThreads('-from:me newer_than:30d', pageToken);
      for (const item of page.threads) {
        if (!item.id) continue;
        const thread = await gmail.getThread(item.id);
        const message = [...(thread.messages || [])].reverse().find(candidate => !candidate.labelIds?.includes('SENT'));
        if (!message?.id) continue;
        if (await prisma.reply.findFirst({ where: { workspaceId, messageId: message.id } })) continue;
        const from = message.payload?.headers?.find(header => header.name?.toLowerCase() === 'from')?.value || '';
        const email = this.extractEmail(from);
        const lead = await prisma.lead.findFirst({ where: { workspaceId, OR: [{ email: { equals: email, mode: 'insensitive' } }, { sentEmails: { some: { threadId: item.id } } }] } });
        if (!lead) continue;
        const content = this.extractBody(message);
        const classification = this.classifyContent(content, message.payload?.headers || []);
        await this.ingestReply(workspaceId, lead.id, item.id, content, classification, message.id);
        synced++;
      }
      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken);
    return { synced };
  }

  classifyContent(content: string, headers: { name?: string | null; value?: string | null }[] = []): Classification {
    const text = content.toLowerCase();
    const autoSubmitted = headers.find(header => header.name?.toLowerCase() === 'auto-submitted')?.value;
    if (/delivery status notification|mail delivery subsystem|undeliverable|address not found|delivery has failed/.test(text)) return 'bounce';
    if (autoSubmitted && autoSubmitted !== 'no') return 'auto_reply';
    if (/\b(unsubscribe|remove me|stop emailing|stop contacting|do not contact|don't contact|take me off)\b/.test(text)) return 'unsubscribe';
    if (/\b(not interested|no thanks|no thank you|already have|not right now)\b/.test(text)) return 'not_interested';
    if (/\b(interested|book|meeting|call me|tell me more|more information|sounds good)\b/.test(text)) return 'interested';
    return text.trim() ? 'needs_human_reply' : 'unknown';
  }

  async ingestReply(workspaceId: string, leadId: string, threadId: string, content: string, classification?: Classification, messageId?: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) throw new Error('Lead not found');
    const finalClassification = classification || this.classifyContent(content);
    if (messageId && await prisma.reply.findFirst({ where: { workspaceId, messageId } })) return { duplicate: true, classification: finalClassification };
    await prisma.reply.create({ data: { workspaceId, leadId, threadId, messageId, content, classification: finalClassification } });
    await this.applyClassification(workspaceId, leadId, threadId, finalClassification);
    return { duplicate: false, classification: finalClassification };
  }

  async applyClassification(workspaceId: string, leadId: string, threadId: string, classification: Classification) {
    await prisma.followUpTask.updateMany({ where: { workspaceId, leadId, status: { in: ['scheduled', 'ready', 'processing'] } }, data: { status: 'cancelled' } });
    await prisma.sendQueue.updateMany({ where: { workspaceId, draft: { leadId }, status: { in: ['pending', 'checking_rules', 'queued'] } }, data: { status: 'cancelled', errorReason: 'lead_replied' } });
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) return;
    if (classification === 'unsubscribe') {
      await suppression.add(workspaceId, { leadId, email: lead.email, domain: lead.website, reason: 'Unsubscribe reply', source: 'reply_detection' });
      await audit.log({ workspaceId, entityType: 'Lead', entityId: leadId, action: 'unsubscribe_detected', details: { threadId } });
      return;
    }
    const status = classification === 'bounce' ? 'bounced' : classification === 'not_interested' ? 'not_interested' : 'replied';
    await prisma.lead.update({ where: { id: leadId }, data: { status } });
    await audit.log({ workspaceId, entityType: 'Lead', entityId: leadId, action: classification === 'not_interested' ? 'negative_reply_cooldown_started' : classification === 'bounce' ? 'bounce_detected' : 'reply_detected', details: { classification, threadId, ...(classification === 'not_interested' ? { cooldownDays: 90 } : {}) } });
  }

  private extractBody(message: any): string {
    const decode = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const plain = message.payload?.parts?.find((part: any) => part.mimeType === 'text/plain' && part.body?.data);
    if (plain?.body?.data) return decode(plain.body.data);
    return message.payload?.body?.data ? decode(message.payload.body.data) : '';
  }

  private extractEmail(from: string) {
    return (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
  }
}
