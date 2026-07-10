import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

export async function getAppointmentHistory(patientId: string, cursor?: string) {
  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    take: PAGE_SIZE + 1, // fetch one extra to know if there's a next page
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // skip the cursor item itself, we already saw it
    }),
    orderBy: { createdAt: "desc" },
    include: {
      doctor: { include: { user: true } },
      slot: true,
    },
  });

  const hasNextPage = appointments.length > PAGE_SIZE;
  const items = hasNextPage ? appointments.slice(0, PAGE_SIZE) : appointments;
  const nextCursor = hasNextPage ? items[items.length - 1].id : null;

  return { items, nextCursor };
}