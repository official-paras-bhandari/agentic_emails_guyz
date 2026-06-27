import { execSync } from 'child_process';
import path from 'path';
import { controlPrisma, getTenantPrismaByUrl } from '@packages/db';

export class TenantDBService {
  /**
   * Provision a database for a tenant (CREATE DATABASE + db push)
   */
  async provisionDatabase(dbName: string): Promise<string> {
    const pgHost = process.env.POSTGRES_HOST || 'localhost';
    const pgPort = process.env.POSTGRES_PORT || '5433';
    const pgUser = process.env.POSTGRES_USER || 'postgres';
    const pgPassword = process.env.POSTGRES_PASSWORD || 'postgres';
    
    // Connection string for the new tenant database
    const databaseUrl = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${dbName}`;

    // 1. Create the database in the PostgreSQL server
    try {
      await controlPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully.`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`Database "${dbName}" already exists.`);
      } else {
        console.error(`Failed to create database "${dbName}":`, error);
        throw error;
      }
    }

    // 2. Deploy migrations / push schema using agy-node and the Prisma CLI
    try {
      const baseDir = path.resolve(process.cwd());
      const packagesDbDir = baseDir.includes('apps/web')
        ? path.join(baseDir, '../../packages/db')
        : path.join(baseDir, 'packages/db');
      
      const schemaPath = path.join(packagesDbDir, 'prisma/schema.prisma');
      const cliPath = path.join(packagesDbDir, 'node_modules/prisma/build/index.js');
      const nodeBinary = `"/Users/parashbhandari/Library/Application Support/Antigravity/bin/agy-node"`;

      console.log(`Pushing Prisma schema to ${dbName}...`);
      execSync(`${nodeBinary} "${cliPath}" db push --schema="${schemaPath}" --skip-generate`, {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        stdio: 'inherit',
      });
      console.log(`Schema pushed to database "${dbName}" successfully.`);
    } catch (error) {
      console.error(`Failed to push schema to database "${dbName}":`, error);
      throw error;
    }

    return databaseUrl;
  }

  /**
   * Creates a tenant, database, workspace, and first member
   */
  async createTenant(tenantName: string, adminUserId?: string): Promise<{ tenantId: string; workspaceId: string }> {
    // Generate clean DB name: tenant_ + lowercase alphanumeric
    const safeName = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const dbName = `tenant_${safeName}_${Date.now()}`;
    
    // Provision DB
    const databaseUrl = await this.provisionDatabase(dbName);

    // Create Tenant in Control DB
    const tenant = await controlPrisma.tenant.create({
      data: {
        name: tenantName,
        databaseUrl,
        status: 'ACTIVE',
      },
    });

    // Create Workspace in Control DB linked to Tenant
    const workspace = await controlPrisma.workspace.create({
      data: {
        name: `${tenantName} Workspace`,
        tenantId: tenant.id,
      },
    });

    // Link admin user to tenant and workspace in Control DB if provided
    if (adminUserId) {
      await controlPrisma.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: adminUserId,
          role: 'ADMIN',
        },
      });

      await controlPrisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: adminUserId,
          role: 'OWNER',
        },
      });
    }

    // Initialize Workspace Setting in the Tenant Database
    const tenantPrisma = getTenantPrismaByUrl(databaseUrl);
    
    // Save Workspace representation in tenant DB for referential integrity
    await tenantPrisma.workspace.upsert({
      where: { id: workspace.id },
      update: {},
      create: {
        id: workspace.id,
        name: workspace.name,
      },
    });

    await tenantPrisma.workspaceSetting.upsert({
      where: { workspaceId: workspace.id },
      update: {},
      create: {
        workspaceId: workspace.id,
        dailySendLimit: 50,
        delaySeconds: 30,
      },
    });

    return {
      tenantId: tenant.id,
      workspaceId: workspace.id,
    };
  }
}
export const tenantDbService = new TenantDBService();
