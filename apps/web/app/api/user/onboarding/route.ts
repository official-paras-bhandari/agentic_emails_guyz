import { NextRequest, NextResponse } from 'next/server';
import { controlPrisma } from '@packages/db';
import { withTenantContext, securityErrorStatus } from '@/server/security/request';

/**
 * POST /api/user/onboarding
 * Completes onboarding setup, saving user profile to Control DB and target market to Tenant DB.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userProfile, workspaceProfile, workspaceId } = body;

    if (!userProfile || !workspaceProfile || !workspaceId) {
      return NextResponse.json({ error: 'Missing required onboarding data' }, { status: 400 });
    }

    // Process onboarding using tenant-specific DB scoping
    return await withTenantContext(req, workspaceId, async ({ prisma, userId }) => {
      if (!userId) {
        return NextResponse.json({ error: 'User context is missing' }, { status: 401 });
      }

      // 1. Update User Profile in Control DB
      await controlPrisma.user.update({
        where: { id: userId },
        data: {
          name: userProfile.name?.trim(),
          jobTitle: userProfile.jobTitle?.trim(),
          companyName: userProfile.companyName?.trim(),
          homeCountry: userProfile.homeCountry?.trim(),
          onboardingCompleted: true,
        },
      });

      // 2. Save target market and policy settings to WorkspaceProfile in Tenant DB
      await prisma.workspaceProfile.upsert({
        where: { workspaceId },
        update: {
          defaultCountry: workspaceProfile.defaultCountry?.trim(),
          defaultRegion: workspaceProfile.defaultRegion?.trim(),
          defaultCity: workspaceProfile.defaultCity?.trim(),
          defaultAreas: workspaceProfile.defaultAreas?.trim(),
          defaultSearchScope: workspaceProfile.defaultSearchScope?.trim(),
          defaultIndustry: workspaceProfile.defaultIndustry?.trim(),
          defaultPersona: workspaceProfile.defaultPersona?.trim(),
          businessWebsite: workspaceProfile.businessWebsite?.trim(),
          businessDescription: workspaceProfile.businessDescription?.trim(),
          offerValueProp: workspaceProfile.offerValueProp?.trim(),
          senderIdentity: workspaceProfile.senderIdentity?.trim(),
          companyAddress: workspaceProfile.companyAddress?.trim(),
          companyFooter: workspaceProfile.companyFooter?.trim(),
          approvalMode: workspaceProfile.approvalMode || 'manual',
        },
        create: {
          workspaceId,
          defaultCountry: workspaceProfile.defaultCountry?.trim(),
          defaultRegion: workspaceProfile.defaultRegion?.trim(),
          defaultCity: workspaceProfile.defaultCity?.trim(),
          defaultAreas: workspaceProfile.defaultAreas?.trim(),
          defaultSearchScope: workspaceProfile.defaultSearchScope?.trim(),
          defaultIndustry: workspaceProfile.defaultIndustry?.trim(),
          defaultPersona: workspaceProfile.defaultPersona?.trim(),
          businessWebsite: workspaceProfile.businessWebsite?.trim(),
          businessDescription: workspaceProfile.businessDescription?.trim(),
          offerValueProp: workspaceProfile.offerValueProp?.trim(),
          senderIdentity: workspaceProfile.senderIdentity?.trim(),
          companyAddress: workspaceProfile.companyAddress?.trim(),
          companyFooter: workspaceProfile.companyFooter?.trim(),
          approvalMode: workspaceProfile.approvalMode || 'manual',
        },
      });

      // 3. Make sure workspace representation exists in Tenant DB
      await prisma.workspace.upsert({
        where: { id: workspaceId },
        update: {},
        create: {
          id: workspaceId,
          name: `${userProfile.companyName || 'My'} Workspace`,
        },
      });

      return NextResponse.json({ ok: true });
    });
  } catch (error: any) {
    console.error('Onboarding failed:', error);
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
