import { prisma } from '@packages/db';
import { TelegramBotService } from './TelegramBotService';
import { TelegramAuthService } from './TelegramAuthService';
import { CommandOrchestrator } from './CommandOrchestrator';
import { JobService } from './JobService';
import { ContactPolicyService } from './ContactPolicyService';

export class TelegramCommandService {
  private tg: TelegramBotService;
  private auth: TelegramAuthService;
  private orchestrator: CommandOrchestrator;
  private jobs = new JobService();
  private policy = new ContactPolicyService();

  constructor() {
    this.tg = new TelegramBotService();
    this.auth = new TelegramAuthService();
    this.orchestrator = new CommandOrchestrator();
  }

  async handleUpdate(update: any) {
    if (update.message) {
      await this.handleMessage(update.message);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    }
  }

  private async handleMessage(message: any) {
    const fromId = String(message.from.id);
    const text = message.text || '';

    if (!(await this.auth.isAllowed(fromId))) {
      await this.tg.sendMessage(message.chat.id, "❌ Access Denied. Your Telegram ID is not authorized.");
      return;
    }

    const conn = await this.auth.getConnection(fromId);
    if (!conn && !text.startsWith('/start')) {
      await this.tg.sendMessage(message.chat.id, "❌ Connection not found. Please use /start with your token.");
      return;
    }

    if (text.startsWith('/find')) {
      await this.handleFind(message, conn);
    } else if (text.startsWith('/status')) {
      await this.handleStatus(message, conn);
    } else if (text.startsWith('/campaigns')) {
      await this.handleCampaigns(message, conn);
    } else if (text.startsWith('/jobs')) {
      await this.handleJobs(message, conn);
    } else if (text.startsWith('/drafts')) {
      await this.handleDrafts(message, conn);
    } else if (text.startsWith('/mode')) {
      await this.handleMode(message, conn);
    } else if (text.startsWith('/pause')) {
      await this.handlePauseResume(message, conn, true);
    } else if (text.startsWith('/resume')) {
      await this.handlePauseResume(message, conn, false);
    } else if (text.startsWith('/start')) {
      await this.handleStart(message);
    } else if (text.startsWith('/help')) {
      await this.handleHelp(message);
    }
  }

  private async handleStart(message: any) {
    await this.tg.sendMessage(message.chat.id, "👋 <b>Welcome to Agentic Outreach Bot!</b>\n\nUse /help to see available commands.");
  }

  private async handleHelp(message: any) {
    const helpText = `
🤖 <b>Available Commands:</b>
/status - System overview
/find &lt;query&gt; - Start lead discovery
/jobs - List active jobs
/campaigns - List campaigns
/mode &lt;id&gt; &lt;mode&gt; - Change verification mode
/pause &lt;id&gt; - Pause campaign
/resume &lt;id&gt; - Resume campaign
/drafts - List pending drafts
`;
    await this.tg.sendMessage(message.chat.id, helpText);
  }

  private async handleStatus(message: any, conn: any) {
    await this.log(conn, 'telegram_status_requested');
    const stats = await this.getSystemStats(conn.workspaceId);
    const text = `
📊 <b>System Status:</b>
• Active jobs: ${stats.activeJobs}
• Leads found today: ${stats.leadsFoundToday}
• Drafts needing review: ${stats.draftsNeedingReview}
• Send queue pending: ${stats.pendingSends}
• Sent today: ${stats.sentToday} / ${stats.dailyLimit}
• Blocked by rules: ${stats.blockedToday}
• Replies received: ${stats.repliesToday}
`;
    await this.tg.sendMessage(message.chat.id, text);
  }

  private async handleFind(message: any, conn: any) {
    const query = message.text.replace('/find', '').trim();
    if (!query) {
      await this.tg.sendMessage(message.chat.id, "Please provide a query. Example: /find 10 salons in Sydney");
      return;
    }

    const planText = `
🔍 <b>I understood your request:</b>
• Goal: Find leads
• Query: ${query}

<b>Plan:</b>
1. Search public websites
2. Extract leads via ScrapeGraphAI
3. Skip duplicates
4. Draft emails
5. Route based on Verification Mode

<i>Confirm to start discovery?</i>
`;
    await this.tg.sendMessage(message.chat.id, planText, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 Run Plan', callback_data: `run_plan_${Buffer.from(query).toString('base64')}` },
          { text: '❌ Cancel', callback_data: 'cancel_action' }
        ]]
      }
    });
  }

  private async handleJobs(message: any, conn: any) {
    const jobs = await prisma.job.findMany({
      where: { workspaceId: conn.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (jobs.length === 0) {
      await this.tg.sendMessage(message.chat.id, "No recent jobs found.");
      return;
    }

    let text = "📋 <b>Recent Jobs:</b>\n";
    jobs.forEach(j => {
      text += `\n• <code>${j.id}</code>: ${j.name}\nStatus: ${j.status.toUpperCase()}\n`;
    });

    await this.tg.sendMessage(message.chat.id, text);
  }

  private async handleCampaigns(message: any, conn: any) {
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId: conn.workspaceId },
      take: 5
    });

    if (campaigns.length === 0) {
      await this.tg.sendMessage(message.chat.id, "No campaigns found.");
      return;
    }

    let text = "📣 <b>Campaigns:</b>\n";
    campaigns.forEach(c => {
      text += `\n<b>${c.name}</b> (<code>${c.id}</code>)\nMode: ${c.verificationMode}\nStatus: ${c.status}\n`;
    });

    await this.tg.sendMessage(message.chat.id, text);
  }

  private async handleDrafts(message: any, conn: any) {
    const drafts = await prisma.emailDraft.findMany({
      where: { workspaceId: conn.workspaceId, status: 'needs_review' },
      take: 5
    });

    if (drafts.length === 0) {
      await this.tg.sendMessage(message.chat.id, "✅ No drafts currently need review.");
      return;
    }

    let text = "✉️ <b>Drafts Needing Review:</b>\n";
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    drafts.forEach(d => {
      text += `\n• <code>${d.id}</code>: ${d.subject}`;
      keyboard.push([{ text: `Approve ${d.id.slice(0,6)}...`, callback_data: `approve_draft_${d.id}` }]);
    });

    await this.tg.sendMessage(message.chat.id, text, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  private async handlePauseResume(message: any, conn: any, pause: boolean) {
    const campaignId = message.text.split(' ')[1];
    if (!campaignId) {
      await this.tg.sendMessage(message.chat.id, `Usage: /${pause ? 'pause' : 'resume'} &lt;campaign_id&gt;`);
      return;
    }

    await prisma.campaign.update({
      where: { id: campaignId, workspaceId: conn.workspaceId },
      data: { status: pause ? 'paused' : 'active' }
    });

    await this.log(conn, pause ? 'telegram_campaign_paused' : 'telegram_campaign_resumed', { campaignId });
    await this.tg.sendMessage(message.chat.id, `✅ Campaign <code>${campaignId}</code> ${pause ? 'paused' : 'resumed'}.`);
  }

  private async handleMode(message: any, conn: any) {
    const parts = message.text.split(' ');
    if (parts.length < 3) {
      await this.tg.sendMessage(message.chat.id, "Usage: /mode &lt;campaign_id&gt; &lt;manual_verify|auto_verify|remove_control&gt;");
      return;
    }

    const campaignId = parts[1];
    const mode = parts[2];

    if (mode === 'remove_control') {
      await this.tg.sendMessage(message.chat.id, `
⚠️ <b>Enable Remove Control?</b>
This campaign will not use manual approval. Emails will send automatically after backend safety checks. Sent, skipped, blocked, and failed records will still be logged.
`, {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Enable Remove Control', callback_data: `confirm_mode_${campaignId}_remove_control` },
            { text: 'Cancel', callback_data: 'cancel_action' }
          ]]
        }
      });
    } else {
      await this.updateCampaignMode(conn, campaignId, mode);
    }
  }

  private async handleCallbackQuery(query: any) {
    const fromId = String(query.from.id);
    const conn = await this.auth.getConnection(fromId);
    if (!conn) return;

    const data = query.data;

    if (data.startsWith('run_plan_')) {
      const q = Buffer.from(data.replace('run_plan_', ''), 'base64').toString();
      await this.log(conn, 'telegram_plan_confirmed', { query: q });
      const session = await prisma.chatSession.create({ data: { workspaceId: conn.workspaceId, title: `Telegram: ${q.slice(0, 60)}` } });
      const command = await prisma.userCommand.create({ data: { sessionId: session.id, rawPrompt: q, commandType: 'scrape_leads', status: 'APPROVED', plan: { intent: 'scrape_leads', goal: q } } });
      const job = await this.jobs.createJob(conn.workspaceId, command.id, `Telegram: ${q.slice(0, 50)}`);
      await this.jobs.startWorkerJob(job, q, conn.userId);
      await this.tg.answerCallbackQuery(query.id, "Job started!");
      await this.tg.sendMessage(query.message.chat.id, `🚀 Job <code>${job.id}</code> started.`);
    } else if (data.startsWith('confirm_mode_')) {
      const parts = data.split('_');
      const campaignId = parts[2];
      const mode = parts[3] === 'remove' ? 'remove_control' : parts[3];
      await this.updateCampaignMode(conn, campaignId, mode);
      await this.tg.answerCallbackQuery(query.id, "Mode updated!");
    } else if (data.startsWith('approve_draft_')) {
      const draftId = data.replace('approve_draft_', '');
      const draft = await prisma.emailDraft.findFirst({ where: { id: draftId, workspaceId: conn.workspaceId } });
      if (!draft) { await this.tg.answerCallbackQuery(query.id, 'Draft not found'); return; }
      const allowed = await this.policy.canQueueSend(conn.workspaceId, draft.leadId, draft.campaignId || undefined);
      if (!allowed.allowed) { await this.tg.answerCallbackQuery(query.id, `Blocked: ${allowed.reason}`); return; }
      await prisma.emailDraft.update({
        where: { id: draftId, workspaceId: conn.workspaceId },
        data: { status: 'approved' }
      });
      await prisma.sendQueue.upsert({ where: { draftId }, update: { status: 'pending', errorReason: null }, create: { workspaceId: conn.workspaceId, draftId, status: 'pending' } });
      await this.log(conn, 'telegram_draft_approved', { draftId });
      await this.tg.answerCallbackQuery(query.id, "Draft approved!");
      await this.tg.sendMessage(query.message.chat.id, `✅ Draft <code>${draftId}</code> approved.`);
    } else if (data === 'cancel_action') {
      await this.tg.answerCallbackQuery(query.id, "Cancelled");
      await this.tg.sendMessage(query.message.chat.id, "Action cancelled.");
    }
  }

  private async updateCampaignMode(conn: any, campaignId: string, mode: string) {
    await prisma.campaign.update({
      where: { id: campaignId, workspaceId: conn.workspaceId },
      data: { verificationMode: mode }
    });

    await this.log(conn, 'telegram_mode_changed', { campaignId, mode });
    await this.tg.sendMessage(conn.telegramChatId, `✅ Campaign mode updated to <b>${mode}</b>`);
  }

  private async log(conn: any, action: string, details: any = {}) {
    await prisma.auditLog.create({
      data: {
        workspaceId: conn.workspaceId,
        entityType: 'Telegram',
        entityId: conn.telegramUserId,
        action,
        details
      }
    });
  }

  private async getSystemStats(workspaceId: string) {
    const [activeJobs, leadsToday, draftsReview, pendingSends, sentToday, repliesToday] = await Promise.all([
      prisma.job.count({ where: { workspaceId, status: 'running' } }),
      prisma.lead.count({ where: { workspaceId, createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      prisma.emailDraft.count({ where: { workspaceId, status: 'needs_review' } }),
      prisma.sendQueue.count({ where: { workspaceId, status: 'queued' } }),
      prisma.sentEmail.count({ where: { workspaceId, sentAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      prisma.reply.count({ where: { workspaceId, receivedAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);

    const settings = await prisma.workspaceSetting.findUnique({ where: { workspaceId } });

    return {
      activeJobs,
      leadsFoundToday: leadsToday,
      draftsNeedingReview: draftsReview,
      pendingSends,
      sentToday,
      dailyLimit: settings?.dailySendLimit || 100,
      blockedToday: 0,
      repliesToday
    };
  }
}
