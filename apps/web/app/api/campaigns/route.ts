import { NextRequest, NextResponse } from 'next/server';
import { CampaignService } from '@/server/services/CampaignService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
const service = new CampaignService();
export async function GET(req: NextRequest) { try { return NextResponse.json(await service.list(requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId')))); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); } }
export async function POST(req: NextRequest) { try { const body = await req.json(); return NextResponse.json(await service.create(requireWorkspace(req, body.workspaceId), body), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); } }
