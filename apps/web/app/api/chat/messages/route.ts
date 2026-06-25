import { NextResponse } from 'next/server';
import { ChatService } from '@/server/services/ChatService';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const chatService = new ChatService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    const workspaceId = requireWorkspace(request as any, searchParams.get('workspaceId'));
    const session = await prisma.chatSession.findFirst({ where: { id: sessionId, workspaceId } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const messages = await chatService.getMessages(sessionId);
    return NextResponse.json(messages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { sessionId, role, content, workspaceId: requestedWorkspaceId } = await request.json();
    const workspaceId = requireWorkspace(request as any, requestedWorkspaceId);
    const session = await prisma.chatSession.findFirst({ where: { id: sessionId, workspaceId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string' || !content.trim()) return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    const message = await chatService.addMessage(sessionId, role, content);
    
    // Auto-update session title based on the first user message
    if (role === 'user' && !session.title) {
      let title = content.trim();
      // Strip leading and trailing double or single quotes
      if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
        title = title.substring(1, title.length - 1).trim();
      }
      if (title.length > 50) {
        title = title.substring(0, 50) + '...';
      }
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title }
      });
    }
    
    return NextResponse.json(message);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

