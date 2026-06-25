import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();

// Import services directly
const { DedupeService } = await import('../apps/web/server/services/DedupeService.ts');
const { DomainGuardService } = await import('../apps/web/server/services/DomainGuardService.ts');
const { SendQueueService } = await import('../apps/web/server/services/SendQueueService.ts');
const { ContactPolicyService } = await import('../apps/web/server/services/ContactPolicyService.ts');

const assert = (value, message) => { if (!value) throw new Error(message); };

async function testDedupeService(workspaceId) {
  console.log('--- Testing DedupeService batch deduplication ---');
  const dedupe = new DedupeService();

  // Create test workspace
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, name: 'Dedupe Unit Tests' }
  });

  // Clean up any old leads in test workspace
  await prisma.lead.deleteMany({ where: { workspaceId } });

  // 1. Setup existing leads in database
  await prisma.lead.create({
    data: {
      workspaceId,
      email: 'a@example.com',
      website: 'https://a.com',
      normalizedDomain: 'a.com',
      phone: '1234567890',
      normalizedPhone: '1234567890',
      businessName: 'Business A',
      suburb: 'Suburb A',
      status: 'new',
      sources: {
        create: {
          url: 'https://a.com/source',
          type: 'import',
          extractionLocation: 'manual'
        }
      }
    }
  });

  // 2. Test exact matches
  const inputLeads = [
    // Duplicate email
    { email: 'A@example.com' },
    // Duplicate domain
    { website: 'https://A.com' },
    // Duplicate phone
    { phone: '1234567890' },
    // Duplicate business name + suburb (case insensitive)
    { businessName: 'business a', suburb: 'suburb a' },
    // Duplicate source url
    { sourceUrl: 'https://a.com/source' },
    // No duplicate
    { email: 'new@example.com', website: 'https://new.com', phone: '0987654321', businessName: 'New Biz', suburb: 'New Sub', sourceUrl: 'https://new.com/source' }
  ];

  const results = await dedupe.findExistingLeadsBatch(workspaceId, inputLeads);
  
  assert(results.get(inputLeads[0])?.reason === 'duplicate_email', 'Email deduplication failed');
  assert(results.get(inputLeads[1])?.reason === 'duplicate_domain', 'Domain deduplication failed');
  assert(results.get(inputLeads[2])?.reason === 'duplicate_phone', 'Phone deduplication failed');
  assert(results.get(inputLeads[3])?.reason === 'duplicate_business_suburb', 'Business+Suburb deduplication failed');
  assert(results.get(inputLeads[4])?.reason === 'duplicate_source_url', 'Source URL deduplication failed');
  assert(results.get(inputLeads[5]) === null, 'Non-duplicate marked as duplicate');

  // 3. Test priority matching (Email > Domain > Phone > Business+Suburb > Source URL)
  // Lead matches:
  // - Email of A
  // - Domain of A
  // - Phone of A
  // - Business+Suburb of A
  // - Source URL of A
  // It must return duplicate_email (highest priority)
  const priorityLead1 = {
    email: 'a@example.com',
    website: 'https://a.com',
    phone: '1234567890',
    businessName: 'Business A',
    suburb: 'Suburb A',
    sourceUrl: 'https://a.com/source'
  };
  const res1 = await dedupe.findExistingLeadsBatch(workspaceId, [priorityLead1]);
  assert(res1.get(priorityLead1)?.reason === 'duplicate_email', 'Priority 1 (email) failed');

  // Lead matches:
  // - Domain of A
  // - Phone of A
  // - Business+Suburb of A
  // - Source URL of A
  // It must return duplicate_domain
  const priorityLead2 = {
    website: 'https://a.com',
    phone: '1234567890',
    businessName: 'Business A',
    suburb: 'Suburb A',
    sourceUrl: 'https://a.com/source'
  };
  const res2 = await dedupe.findExistingLeadsBatch(workspaceId, [priorityLead2]);
  assert(res2.get(priorityLead2)?.reason === 'duplicate_domain', 'Priority 2 (domain) failed');

  // Lead matches:
  // - Phone of A
  // - Business+Suburb of A
  // - Source URL of A
  // It must return duplicate_phone
  const priorityLead3 = {
    phone: '1234567890',
    businessName: 'Business A',
    suburb: 'Suburb A',
    sourceUrl: 'https://a.com/source'
  };
  const res3 = await dedupe.findExistingLeadsBatch(workspaceId, [priorityLead3]);
  assert(res3.get(priorityLead3)?.reason === 'duplicate_phone', 'Priority 3 (phone) failed');

  // Lead matches:
  // - Business+Suburb of A
  // - Source URL of A
  // It must return duplicate_business_suburb
  const priorityLead4 = {
    businessName: 'Business A',
    suburb: 'Suburb A',
    sourceUrl: 'https://a.com/source'
  };
  const res4 = await dedupe.findExistingLeadsBatch(workspaceId, [priorityLead4]);
  assert(res4.get(priorityLead4)?.reason === 'duplicate_business_suburb', 'Priority 4 (business+suburb) failed');

  console.log('DedupeService unit tests passed.');
}

async function testDomainGuardService() {
  console.log('--- Testing DomainGuardService keyword bypass ---');
  const guard = new DomainGuardService();

  // Test keyword bypass case (blocked keyword + allowed keyword)
  const resBypass = await guard.classifyIntent('Write me a recipe for salon marketing');
  assert(resBypass.allowed === false, 'Combined bypass request was allowed');
  assert(resBypass.intent === 'out_of_scope', 'Bypass request intent was not out_of_scope');

  // Test purely allowed case
  const resAllowed = await guard.classifyIntent('Find 10 salons in Sydney');
  assert(resAllowed.allowed === true, 'Valid request was blocked');
  assert(resAllowed.intent === 'scrape_leads', 'Valid request intent was incorrect');

  // Test purely blocked case
  const resBlocked = await guard.classifyIntent('Write me a recipe');
  assert(resBlocked.allowed === false, 'Blocked request was allowed');
  assert(resBlocked.intent === 'out_of_scope', 'Blocked request intent was not out_of_scope');

  console.log('DomainGuardService unit tests passed.');
}

async function testSendQueueService(workspaceId) {
  console.log('--- Testing SendQueueService lease safety & sweep ---');
  const sendQueue = new SendQueueService();

  // Create test workspace
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, name: 'SendQueue Unit Tests' }
  });

  // Clean up old queue/drafts in test workspace
  await prisma.sendQueue.deleteMany({ where: { workspaceId } });
  await prisma.emailDraft.deleteMany({ where: { workspaceId } });
  await prisma.lead.deleteMany({ where: { workspaceId } });

  // 1. Create a lead and drafts for testing leases
  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      email: 'sendqueue-test@example.com',
      businessName: 'Queue Test Biz'
    }
  });

  const draftExpired = await prisma.emailDraft.create({
    data: {
      workspaceId,
      leadId: lead.id,
      subject: 'Expired Lease Subject',
      body: 'Test body'
    }
  });

  const draftActive = await prisma.emailDraft.create({
    data: {
      workspaceId,
      leadId: lead.id,
      subject: 'Active Lease Subject',
      body: 'Test body'
    }
  });

  // 2. Create expired lease queue item (status checking_rules, leaseExpiresAt in past)
  const expiredItem = await prisma.sendQueue.create({
    data: {
      workspaceId,
      draftId: draftExpired.id,
      status: 'checking_rules',
      leaseOwner: 'crashed-worker-id',
      leaseExpiresAt: new Date(Date.now() - 1000 * 60) // 1 minute ago
    }
  });

  // 3. Create active lease queue item (status checking_rules, leaseExpiresAt in future)
  const activeItem = await prisma.sendQueue.create({
    data: {
      workspaceId,
      draftId: draftActive.id,
      status: 'checking_rules',
      leaseOwner: 'active-worker-id',
      leaseExpiresAt: new Date(Date.now() + 1000 * 60) // 1 minute in future
    }
  });

  // 4. Run cleanupExpiredLeases sweep
  const cleanupCount = await sendQueue.cleanupExpiredLeases(workspaceId);
  assert(cleanupCount.count === 1, `Expected 1 cleaned lease, got ${cleanupCount.count}`);

  // 5. Verify database state
  const updatedExpired = await prisma.sendQueue.findUnique({ where: { id: expiredItem.id } });
  assert(updatedExpired.status === 'pending', 'Expired lease status was not reset to pending');
  assert(updatedExpired.leaseOwner === null, 'Expired lease owner was not cleared');
  assert(updatedExpired.leaseExpiresAt === null, 'Expired lease expiration was not cleared');

  const updatedActive = await prisma.sendQueue.findUnique({ where: { id: activeItem.id } });
  assert(updatedActive.status === 'checking_rules', 'Active lease status was incorrectly reset');
  assert(updatedActive.leaseOwner === 'active-worker-id', 'Active lease owner was incorrectly cleared');
  assert(updatedActive.leaseExpiresAt !== null, 'Active lease expiration was incorrectly cleared');

  console.log('SendQueueService unit tests passed.');
}

async function testFollowUpPolicyService(workspaceId) {
  console.log('--- Testing follow-up drafting and send policy ---');
  const policy = new ContactPolicyService();

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, name: 'FollowUp Policy Tests' }
  });
  await prisma.workspaceSetting.upsert({
    where: { workspaceId },
    update: { dailySendLimit: 10 },
    create: { workspaceId, dailySendLimit: 10 }
  });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      name: 'Follow-up policy test',
      status: 'active',
      maxFollowUps: 4,
      autoFollowUp: true,
    }
  });

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      email: 'followup-policy@example.com',
      businessName: 'Follow-up Policy Biz',
      status: 'sent_in_campaign',
      campaignLeads: { create: { campaignId: campaign.id, status: 'active' } },
    }
  });

  const initialDraft = await prisma.emailDraft.create({
    data: {
      workspaceId,
      leadId: lead.id,
      campaignId: campaign.id,
      subject: 'Initial outreach',
      body: 'Initial body',
      status: 'sent',
      verificationReasons: [],
      verificationStatus: 'passed',
      requiresHumanReview: false,
      versions: { create: { versionNumber: 1, subject: 'Initial outreach', body: 'Initial body', createdBy: 'agent' } },
    }
  });

  await prisma.sentEmail.create({
    data: {
      workspaceId,
      leadId: lead.id,
      draftId: initialDraft.id,
      deliveryStatus: 'sent',
      sentAt: new Date(),
    }
  });

  await prisma.followUpTask.create({
    data: {
      workspaceId,
      leadId: lead.id,
      campaignId: campaign.id,
      stepNumber: 1,
      status: 'completed',
      scheduledFor: new Date(Date.now() - 60_000),
    }
  });

  const canDraftFollowUp = await policy.canDraftEmail(workspaceId, lead.id, campaign.id);
  assert(canDraftFollowUp.allowed === true, 'Sent initial draft incorrectly blocks follow-up draft creation');

  const canSendFollowUp = await policy.canSendNow(workspaceId, lead.id, campaign.id, { isFollowUp: true });
  assert(canSendFollowUp.allowed === true, 'Follow-up send should bypass recent-send cooldown');

  const canSendInitialAgain = await policy.canSendNow(workspaceId, lead.id, campaign.id);
  assert(canSendInitialAgain.allowed === false && canSendInitialAgain.reason === 'already_sent_recently', 'Initial resend should still be blocked by recent-send cooldown');

  console.log('Follow-up policy unit tests passed.');
}

async function run() {
  const suffix = Date.now().toString(36);
  const workspaceId = `ws_fixes_unit_${suffix}`;
  try {
    await testDedupeService(workspaceId);
    await testDomainGuardService();
    await testSendQueueService(workspaceId);
    await testFollowUpPolicyService(`${workspaceId}_followup`);
    console.log(JSON.stringify({ status: 'passed' }, null, 2));
  } catch (err) {
    console.error('Unit tests failed:', err);
    process.exitCode = 1;
  } finally {
    // Clean up
    await prisma.sendQueue.deleteMany({ where: { workspaceId } }).catch(() => {});
    await prisma.emailDraft.deleteMany({ where: { workspaceId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { workspaceId } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.sendQueue.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.sentEmail.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.followUpTask.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.emailDraft.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.campaign.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.workspaceSetting.deleteMany({ where: { workspaceId: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: `${workspaceId}_followup` } }).catch(() => {});
    await prisma.$disconnect();
  }
}

run();
