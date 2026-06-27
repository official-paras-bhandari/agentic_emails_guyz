import bcrypt from 'bcryptjs';
import { controlPrisma } from '../../packages/db/src/index.ts';
import { TenantDBService } from './server/services/TenantDBService.ts';

async function main() {
  console.log('Resetting and seeding control database...');

  const username = process.env.INTERNAL_USERNAME || 'admin';
  const password = process.env.INTERNAL_PASSWORD || 'adminadmin@123';
  const workspaceId = process.env.INTERNAL_WORKSPACE_ID || 'ws_internal';
  const tenantId = 'tenant_internal';
  const dbName = 'tenant_internal';

  // 1. Clean control database tables
  await controlPrisma.invitation.deleteMany({});
  await controlPrisma.workspaceMember.deleteMany({});
  await controlPrisma.tenantMember.deleteMany({});
  await controlPrisma.workspace.deleteMany({});
  await controlPrisma.tenant.deleteMany({});
  await controlPrisma.user.deleteMany({});

  console.log('Database cleaned.');

  // 2. Hash Password
  const passwordHash = await bcrypt.hash(password, 10);

  // 3. Create active User in Control DB
  const user = await controlPrisma.user.create({
    data: {
      username,
      email: `${username}@example.com`,
      passwordHash,
      isActive: true,
      role: 'ADMIN',
      onboardingCompleted: true,
      name: 'System Admin',
      jobTitle: 'Administrator',
      companyName: 'Internal Corp',
      homeCountry: 'Australia',
    },
  });
  console.log(`Created admin user: ${user.username}`);

  // 4. Provision tenant database
  console.log(`Provisioning tenant database: ${dbName}...`);
  const tenantService = new TenantDBService();
  const databaseUrl = await tenantService.provisionDatabase(dbName);
  console.log(`Database provisioned at URL: ${databaseUrl}`);

  // 5. Create Tenant and Workspace in Control DB
  const tenant = await controlPrisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Default Tenant',
      databaseUrl,
      status: 'ACTIVE',
    },
  });

  const workspace = await controlPrisma.workspace.create({
    data: {
      id: workspaceId,
      name: 'Default Workspace',
      tenantId: tenant.id,
    },
  });
  console.log(`Created tenant: ${tenant.name} and workspace: ${workspace.name}`);

  // 6. Create Memberships in Control DB
  await controlPrisma.tenantMember.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'ADMIN',
    },
  });

  await controlPrisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
    },
  });
  console.log('Memberships associated successfully.');

  console.log('Seed completed successfully!');
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
