import { prisma } from "@/lib/prisma";
import { extendSlotHorizon } from "@/services/slotService";

extendSlotHorizon()
  .then((result) => console.log(`Extended availability for ${result.schedulesProcessed} active schedules.`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
