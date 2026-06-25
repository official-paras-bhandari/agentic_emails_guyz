const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const workspaceId = process.env.INTERNAL_WORKSPACE_ID || 'ws_internal';
  await prisma.workspace.upsert({ where: { id: workspaceId }, update: {}, create: { id: workspaceId, name: 'Internal Workspace' } });
  await prisma.workspaceSetting.upsert({ where: { workspaceId }, update: {}, create: { workspaceId, dailySendLimit: 25, delaySeconds: 1 } });

  const rawUsers = process.env.TEST_USERS || 'unicomate:testtest@123';
  const users = rawUsers
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [username, password] = entry.split(':');
      return {
        username: String(username || '').trim(),
        password: String(password || '').trim(),
      };
    })
    .filter((entry) => entry.username && entry.password);

  for (const entry of users) {
    const passwordHash = await bcrypt.hash(entry.password, 10);
    const user = await prisma.user.upsert({
      where: { username: entry.username },
      update: {
        passwordHash,
        isActive: true,
      },
      create: {
        username: entry.username,
        passwordHash,
        role: 'MEMBER',
        isActive: true,
      },
    });

    const userWorkspaceId = `ws_${entry.username}`;
    await prisma.workspace.upsert({
      where: { id: userWorkspaceId },
      update: { name: `${entry.username} Workspace` },
      create: { id: userWorkspaceId, name: `${entry.username} Workspace` },
    });

    await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: userWorkspaceId,
        },
      },
      update: { role: 'OWNER' },
      create: {
        userId: user.id,
        workspaceId: userWorkspaceId,
        role: 'OWNER',
      },
    });

    await prisma.workspaceSetting.upsert({
      where: { workspaceId: userWorkspaceId },
      update: {},
      create: { workspaceId: userWorkspaceId, dailySendLimit: 25, delaySeconds: 1 },
    });
  }

  console.log(`Seeded shared workspace ${workspaceId}`);
  console.log(`Seeded ${users.length} test users with isolated workspaces`);
}

main().finally(() => prisma.$disconnect());
