export class TelegramBotService {
  private token: string;
  private baseUrl: string;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(chatId: string, text: string, options: any = {}) {
    if (!this.token) return;

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          ...options
        }),
      });
      return response.json();
    } catch (error) {
      console.error('Telegram sendMessage error:', error);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    if (!this.token) return;
    try {
      await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text
        }),
      });
    } catch (error) {
      console.error('Telegram answerCallbackQuery error:', error);
    }
  }

  async sendPhoto(chatId: string, photo: string, caption?: string) {
    if (!this.token) return;
    // Implementation for sending photos if needed
  }
}
