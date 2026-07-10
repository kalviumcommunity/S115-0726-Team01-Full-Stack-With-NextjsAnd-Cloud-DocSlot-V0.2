import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAppointmentHistory(patientId: string, doctorId: string, slotIds: string[]) {
  const statuses = ["COMPLETED", "COMPLETED", "CANCELLED", "CONFIRMED"] as const;

  for (let i = 0; i < slotIds.length; i++) {
    await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        slotId: slotIds[i],
        status: statuses[i % statuses.length],
      },
    });
  }
}

export { seedAppointmentHistory };
