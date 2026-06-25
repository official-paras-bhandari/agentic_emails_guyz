import { prisma } from '@packages/db';

export interface AuditLogData {
  workspaceId: string;
  entityType: string;
  entityId: string;
  action: string;
  details?: any;
}

export class AuditLogService {
  async log(data: AuditLogData) {
    return await prisma.auditLog.create({
      data: {
        workspaceId: data.workspaceId,
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        details: data.details || {}
      }
    });
  }

  async getLogs(workspaceId: string, limit = 50) {
    return await prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
