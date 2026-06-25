import { google } from 'googleapis';
import { GoogleOAuthService } from './GoogleOAuthService';

export class GmailService {
  private mockMode = process.env.GMAIL_MOCK_MODE === 'true';
  private oauthService = new GoogleOAuthService();
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  async initializeForWorkspace(workspaceId: string) {
    if (this.mockMode) return { gmailAddress: 'mock-sender@local.invalid' };
    try {
      const { oauth2Client, email } = await this.oauthService.getValidClient(workspaceId);
      this.oauth2Client = oauth2Client;
      return { gmailAddress: email };
    } catch (e) {
      console.error("Failed to initialize Gmail client:", e);
      throw new Error("Failed to initialize Gmail client.");
    }
  }

  private escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private toHtmlBody(body: string) {
    const trimmed = body.trim();
    if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
    return trimmed
      .split(/\n{2,}/)
      .map(paragraph => `<p>${this.escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  async sendEmail(to: string, subject: string, body: string, messageIdHeader?: string) {
    if (this.mockMode) return { messageId: `mock-${Date.now()}-${Buffer.from(to).toString('base64url')}`, threadId: `mock-thread-${Date.now()}` };
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    const plainBody = body.trim();
    const htmlBody = this.toHtmlBody(body);
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      ...(messageIdHeader ? [`Message-ID: ${messageIdHeader}`] : []),
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      plainBody,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      htmlBody,
      '',
      `--${boundary}--`,
      '',
    ];

    const message = messageParts.join('\r\n');
    
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      messageId: res.data.id,
      threadId: res.data.threadId
    };
  }

  async listThreads(q: string = 'is:unread', pageToken?: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const res = await gmail.users.threads.list({
      userId: 'me',
      q: q,
      maxResults: 100,
      pageToken
    });
    return {
      threads: res.data.threads || [],
      nextPageToken: res.data.nextPageToken || null,
    };
  }

  async getThread(threadId: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const res = await gmail.users.threads.get({
      userId: 'me',
      id: threadId
    });
    return res.data;
  }

  async markAsRead(threadId: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });
  }
}
