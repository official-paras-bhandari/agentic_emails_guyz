export class TelegramService {
  private botToken: string;
  private chatId: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
  }

  async sendMessage(text: string) {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram credentials not set. Skipping notification.');
      return;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: 'HTML'
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
    }
  }

  async notifyJobComplete(jobName: string, leadsFound: number) {
    const message = `✅ <b>Job Complete:</b> ${jobName}\n\n` +
                    `🎯 Found <b>${leadsFound}</b> new leads.\n` +
                    `🚀 Ready for your approval in the dashboard.`;
    return await this.sendMessage(message);
  }

  async notifyNewReply(leadName: string, snippet: string) {
    const message = `📩 <b>New Reply Received!</b>\n\n` +
                    `👤 <b>${leadName}</b> replied to your email.\n` +
                    `💬 <i>"${snippet}"</i>\n\n` +
                    `Check the CRM to respond.`;
    return await this.sendMessage(message);
  }
}
