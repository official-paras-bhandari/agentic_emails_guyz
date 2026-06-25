import { NextRequest, NextResponse } from 'next/server';
import { TelegramCommandService } from '@/server/services/TelegramCommandService';

const telegramService = new TelegramCommandService();

/**
 * POST /api/webhooks/telegram
 * Handles incoming updates from Telegram.
 */
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    
    // Safety check for webhook secret if configured
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const secret = req.headers.get('x-telegram-bot-api-secret-token');
    if ((!configuredSecret && process.env.NODE_ENV === 'production') || (configuredSecret && secret !== configuredSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Process the update in the background or wait for it
    await telegramService.handleUpdate(update);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Telegram Webhook Error:', error);
    // Always return 200 to Telegram to avoid retries on failure
    return NextResponse.json({ ok: true });
  }
}
