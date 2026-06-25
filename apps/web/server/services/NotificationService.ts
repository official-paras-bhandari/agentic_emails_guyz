import { prisma } from '@packages/db';
import { TelegramBotService } from './TelegramBotService';

export class NotificationService {
  private tg: TelegramBotService;

  constructor() {
    this.tg = new TelegramBotService();
  }

  /**
   * Sends a notification to all enabled Telegram connections for a workspace.
   */
  async notify(workspaceId: string, event: { type: string; data: any }) {
    if (process.env.TELEGRAM_ALERTS_ENABLED !== 'true') return;

    const connections = await prisma.telegramConnection.findMany({
      where: { workspaceId, isEnabled: true }
    });

    for (const conn of connections) {
      const message = this.formatMessage(event);
      if (message) {
        await this.tg.sendMessage(conn.telegramChatId, message.text, message.options);
      }
    }
  }

  private formatMessage(event: { type: string; data: any }): { text: string; options?: any } | null {
    const { type, data } = event;

    switch (type) {
      case 'job_completed':
        return {
          text: `✅ <b>Job completed</b>\nCommand: ${data.name}\nFound: ${data.found}\nSaved: ${data.saved}\nDuplicates skipped: ${data.duplicates}\nNo email found: ${data.no_email}\nDrafts ready: ${data.drafts}`,
          options: {
            reply_markup: {
              inline_keyboard: [[
                { text: 'View Status', callback_data: `job_status_${data.job_id}` },
                { text: 'Open App', url: `${process.env.NEXT_PUBLIC_APP_URL}/jobs/${data.job_id}` }
              ]]
            }
          }
        };

      case 'lead_found':
        return {
          text: `🎯 <b>Lead Found</b>\nBusiness: ${data.businessName}\nEmail: ${data.email}\nSource: ${data.website || 'N/A'}`
        };

      case 'reply_received':
        return {
          text: `💬 <b>Reply received</b>\nBusiness: ${data.businessName}\nStatus: ${data.classification}\nCampaign: ${data.campaignName}`,
          options: {
            reply_markup: {
              inline_keyboard: [[
                { text: 'View Reply', url: `${process.env.NEXT_PUBLIC_APP_URL}/leads/${data.leadId}` }
              ]]
            }
          }
        };

      case 'unsubscribe_detected':
        return {
          text: `🚫 <b>Unsubscribe detected</b>\nEmail: ${data.email}\nAction: Added to suppression list and cancelled follow-ups`
        };

      case 'send_queue_updated':
        return {
          text: `📬 <b>Send queue updated</b>\nCampaign: ${data.campaignName}\nPending: ${data.pending}\nSent today: ${data.sentToday} / ${data.dailyLimit}\nBlocked by rules: ${data.blocked}`
        };

      case 'email_sent':
        return {
          text: `📤 <b>Email sent</b>\nTo: ${data.leadEmail}\nCampaign: ${data.campaignName}`
        };

      default:
        return null;
    }
  }
}
