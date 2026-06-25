import { PrismaClient } from '/Users/parashbhandari/Desktop/agentic_agent/packages/db/node_modules/@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const commands = await prisma.userCommand.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      commandPlan: true,
      jobs: true,
    },
  });

  console.log('Last 5 User Commands:');
  for (const cmd of commands) {
    console.log(`Command ID: ${cmd.id}`);
    console.log(`Prompt: ${cmd.rawPrompt}`);
    console.log(`Status: ${cmd.status}`);
    console.log(`Created At: ${cmd.createdAt.toISOString()}`);
    console.log(`Jobs (${cmd.jobs.length}):`);
    for (const j of cmd.jobs) {
      console.log(`  Job ID: ${j.id}, Status: ${j.status}, Created: ${j.createdAt.toISOString()}`);
    }
    console.log('====================================');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
