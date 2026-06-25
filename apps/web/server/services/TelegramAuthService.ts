import { prisma } from '@packages/db';

export class TelegramAuthService {
  private allowedUserIds: string[];

  constructor() {
    this.allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(id => id.trim());
  }

  /**
   * Checks if a Telegram user is allowed to interact with the bot.
   */
  async isAllowed(telegramUserId: string): Promise<boolean> {
    if (!this.allowedUserIds.includes(telegramUserId)) {
      console.warn(`Unauthorized Telegram access attempt: ${telegramUserId}`);
      return false;
    }
    return true;
  }

  /**
   * Resolves a Telegram connection to its workspace and user context.
   */
  async getConnection(telegramUserId: string) {
    return prisma.telegramConnection.findUnique({
      where: { telegramUserId },
      include: { workspace: true, user: true }
    });
  }

  /**
   * Registers or updates a Telegram connection.
   * This would typically happen via a secure /start flow or manual setup.
   */
  async updateConnection(data: {
    telegramUserId: string;
    telegramChatId: string;
    workspaceId: string;
    userId: string;
    username?: string;
  }) {
    return prisma.telegramConnection.upsert({
      where: { telegramUserId: data.telegramUserId },
      update: {
        telegramChatId: data.telegramChatId,
        username: data.username,
        isEnabled: true
      },
      create: {
        telegramUserId: data.telegramUserId,
        telegramChatId: data.telegramChatId,
        workspaceId: data.workspaceId,
        userId: data.userId,
        username: data.username,
      }
    });
  }
}
