import { google } from 'googleapis';
import { prisma } from '@packages/db';
import { GoogleOAuthService } from './GoogleOAuthService';

export class GoogleSheetsService {
  private oauthService: GoogleOAuthService;

  constructor() {
    this.oauthService = new GoogleOAuthService();
  }

  async exportLeadsToSheet(workspaceId: string, sheetTitle: string = 'Agentic Outreach Leads') {
    const connection = await prisma.googleConnection.findFirst({ where: { workspaceId } });
    if (!connection) {
      throw new Error('Google account not connected');
    }

    const { oauth2Client } = await this.oauthService.getValidClient(workspaceId);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Fetch leads
    const leads = await prisma.lead.findMany({
      where: { workspaceId },
      include: {
        campaignLeads: { include: { campaign: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    // Check if sheet exists in Workspace settings or create a new one
    const settings = await prisma.workspaceSetting.findUnique({ where: { workspaceId } });
    let spreadsheetId = settings?.sheetExportId;

    if (!spreadsheetId) {
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: sheetTitle },
          sheets: [{ properties: { title: 'Leads' } }]
        }
      });
      spreadsheetId = response.data.spreadsheetId as string;
      
      // Update settings
      await prisma.workspaceSetting.upsert({
        where: { workspaceId },
        update: { sheetExportId: spreadsheetId },
        create: { workspaceId, sheetExportId: spreadsheetId }
      });
    }

    // Format data
    const headers = ['ID', 'Email', 'Business Name', 'Website', 'Phone', 'Location', 'Status', 'Quality Score', 'Campaigns', 'Created At'];
    const rows = leads.map(lead => [
      lead.id,
      lead.email || '',
      lead.businessName || '',
      lead.website || '',
      lead.phone || '',
      lead.suburb || '',
      lead.status,
      lead.qualityScore?.toString() || '',
      lead.campaignLeads.map(c => c.campaign.name).join(', '),
      lead.createdAt.toISOString()
    ]);

    const values = [headers, ...rows];

    // Clear existing data and update
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Leads!A1:Z',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Leads!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
  }
}
