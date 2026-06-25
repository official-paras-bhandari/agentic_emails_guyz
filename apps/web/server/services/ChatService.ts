import { prisma } from '@packages/db';

export class ChatService {
  async createSession(workspaceId: string) {
    return await prisma.chatSession.create({
      data: {
        workspaceId
      }
    });
  }

  async getMessages(sessionId: string) {
    return await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
    return await prisma.chatMessage.create({
      data: {
        sessionId,
        role,
        content
      }
    });
  }
}
