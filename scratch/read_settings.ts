import { PrismaClient } from '/Users/parashbhandari/Desktop/agentic_agent/packages/db/node_modules/@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.workspaceSetting.findMany();
  console.log('Workspace Settings:', JSON.stringify(settings, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
