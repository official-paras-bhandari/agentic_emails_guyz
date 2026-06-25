import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/server/services/GoogleSheetsService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);

    const googleSheetsService = new GoogleSheetsService();
    const result = await googleSheetsService.exportLeadsToSheet(workspaceId);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Export Leads Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export leads' },
      { status: securityErrorStatus(error) }
    );
  }
}

