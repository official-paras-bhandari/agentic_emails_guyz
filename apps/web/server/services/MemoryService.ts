import { prisma } from '@packages/db';

export class MemoryService {
  // Workspace Memory
  async addWorkspaceMemory(workspaceId: string, data: { type: string; title: string; content: string; source?: string }) {
    return await prisma.workspaceMemory.create({
      data: {
        workspaceId,
        type: data.type,
        title: data.title,
        content: data.content,
        source: data.source,
        confidence: 1.0,
        isActive: true
      }
    });
  }

  async getWorkspaceMemory(workspaceId: string) {
    return await prisma.workspaceMemory.findMany({
      where: { workspaceId, isActive: true }
    });
  }

  // Lead Memory
  async addLeadMemory(workspaceId: string, leadId: string, data: { memoryType: string; content: string; sourceUrl?: string }) {
    return await prisma.leadMemory.create({
      data: {
        workspaceId,
        leadId,
        memoryType: data.memoryType,
        content: data.content,
        sourceUrl: data.sourceUrl,
        confidence: 0.9
      }
    });
  }

  async getLeadMemory(workspaceId: string, leadId?: string) {
    return await prisma.leadMemory.findMany({
      where: { workspaceId, ...(leadId ? { leadId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }

  // Campaign Memory
  async addCampaignMemory(workspaceId: string, campaignId: string, data: { memoryType: string; content: string; metricName?: string; metricValue?: number }) {
    return await prisma.campaignMemory.create({
      data: {
        workspaceId,
        campaignId,
        memoryType: data.memoryType,
        content: data.content,
        metricName: data.metricName,
        metricValue: data.metricValue
      }
    });
  }

  async getCampaignMemory(workspaceId: string, campaignId?: string) {
    return await prisma.campaignMemory.findMany({
      where: { workspaceId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }

  // Outcome Memory
  async addOutcomeMemory(workspaceId: string, data: { leadId?: string; campaignId?: string; emailDraftId?: string; eventType: string; summary?: string; scoreImpact?: number }) {
    return await prisma.outcomeMemory.create({
      data: {
        workspaceId,
        leadId: data.leadId,
        campaignId: data.campaignId,
        emailDraftId: data.emailDraftId,
        eventType: data.eventType,
        summary: data.summary,
        scoreImpact: data.scoreImpact
      }
    });
  }

  // Combined Retrieval for Agents
  async getAgentContext(workspaceId: string, leadId?: string, campaignId?: string) {
    const workspaceMemory = await this.getWorkspaceMemory(workspaceId);
    const leadMemory = await this.getLeadMemory(workspaceId, leadId);
    const campaignMemory = await this.getCampaignMemory(workspaceId, campaignId);
    
    // Also get similar campaign outcomes
    const outcomes = await prisma.outcomeMemory.findMany({
      where: { workspaceId, eventType: { in: ['replied_positive', 'replied_negative', 'approved', 'rejected'] } },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return {
      workspaceMemory,
      leadMemory,
      campaignMemory,
      outcomes
    };
  }
}
