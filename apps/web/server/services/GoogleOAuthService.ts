import { google } from 'googleapis';
import { prisma } from '@packages/db';
import { encrypt, decrypt } from '../security/encryption';

export class GoogleOAuthService {
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  getAuthUrl(state: string) {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/userinfo.email'],
      state,
      prompt: 'consent' // Force to get refresh token
    });
  }

  async getValidClient(workspaceId: string) {
    const connection = await prisma.googleConnection.findFirst({
      where: { workspaceId },
      orderBy: { connectedAt: 'desc' }
    });

    if (!connection) {
      throw new Error(`No Google connection found for workspace: ${workspaceId}`);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const accessToken = decrypt(connection.encryptedAccessToken);
    const refreshToken = decrypt(connection.encryptedRefreshToken);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      scope: connection.scopes,
      expiry_date: connection.expiresAt.getTime()
    });

    oauth2Client.removeAllListeners('tokens');
    oauth2Client.on('tokens', async tokens => {
      const data: { encryptedAccessToken?: string; encryptedRefreshToken?: string; expiresAt?: Date } = {};
      if (tokens.access_token) data.encryptedAccessToken = encrypt(tokens.access_token);
      if (tokens.refresh_token) data.encryptedRefreshToken = encrypt(tokens.refresh_token);
      if (tokens.expiry_date) data.expiresAt = new Date(tokens.expiry_date);
      if (Object.keys(data).length) {
        await prisma.googleConnection.update({
          where: { id: connection.id },
          data
        });
      }
    });

    return { oauth2Client, email: connection.gmailAddress };
  }

  async handleCallback(code: string, workspaceId: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Get email address
    const oauth2 = google.oauth2({
      auth: this.oauth2Client,
      version: 'v2'
    });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      throw new Error("Could not retrieve email from Google");
    }

    if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error("Missing access or refresh token from Google callback");
    }

    // Encrypt tokens before saving
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = encrypt(tokens.refresh_token);

    const expiryDate = tokens.expiry_date 
      ? new Date(tokens.expiry_date) 
      : new Date(Date.now() + 3600 * 1000);

    // Save to DB
    await prisma.googleConnection.upsert({
      where: { gmailAddress: email },
      update: {
        workspaceId,
        encryptedAccessToken,
        encryptedRefreshToken,
        scopes: tokens.scope || '',
        expiresAt: expiryDate,
        updatedAt: new Date()
      },
      create: {
        workspaceId,
        gmailAddress: email,
        encryptedAccessToken,
        encryptedRefreshToken,
        scopes: tokens.scope || '',
        expiresAt: expiryDate,
        connectedAt: new Date(),
        updatedAt: new Date()
      }
    });

    return { email };
  }
}

