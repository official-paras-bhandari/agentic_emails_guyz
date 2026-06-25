import { NextResponse } from 'next/server';
import { ChatService } from '@/server/services/ChatService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { prisma } from '@packages/db';

const chatService = new ChatService();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = requireWorkspace(req as any, searchParams.get('workspaceId'));
    const sessions = await prisma.chatSession.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    return NextResponse.json(sessions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req as any, body.workspaceId);
    const session = await chatService.createSession(workspaceId);
    return NextResponse.json(session);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, title } = body;
    if (!sessionId || !title) {
      return NextResponse.json({ error: 'sessionId and title are required' }, { status: 400 });
    }
    const workspaceId = requireWorkspace(req as any, body.workspaceId);
    const updated = await prisma.chatSession.update({
      where: { id: sessionId, workspaceId },
      data: { title }
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const workspaceId = requireWorkspace(req as any, searchParams.get('workspaceId'));

    let sessionIdsToDelete: string[] = [];

    if (sessionId) {
      sessionIdsToDelete = [sessionId];
    } else {
      // Try to parse from body
      const body = await req.json().catch(() => ({}));
      if (body.sessionIds && Array.isArray(body.sessionIds)) {
        sessionIdsToDelete = body.sessionIds;
      }
    }

    if (sessionIdsToDelete.length === 0) {
      return NextResponse.json({ error: 'sessionId or sessionIds are required' }, { status: 400 });
    }

    // Delete commands and messages first
    await prisma.userCommand.deleteMany({
      where: {
        sessionId: { in: sessionIdsToDelete }
      }
    });

    await prisma.chatMessage.deleteMany({
      where: {
        sessionId: { in: sessionIdsToDelete }
      }
    });

    await prisma.chatSession.deleteMany({
      where: {
        id: { in: sessionIdsToDelete },
        workspaceId
      }
    });

    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}


