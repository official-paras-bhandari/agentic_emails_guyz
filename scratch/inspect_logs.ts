import { PrismaClient } from '/Users/parashbhandari/Desktop/agentic_agent/packages/db/node_modules/@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const job = await prisma.job.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { jobLogs: true },
  });

  if (!job) return;
  console.log(`Job ID: ${job.id}`);
  console.log('Logs:');
  job.jobLogs.forEach((l, i) => {
    console.log(`${i}: [${l.level}] message="${l.message}" data=${JSON.stringify(l.data)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
