import { prisma } from "@/lib/prisma";

type CreateScheduleInput = {
  doctorId: string;
  dayOfWeek: number; // 0-6
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  slotDuration?: number; // minutes, defaults to 30
};

export async function createWeeklySchedule(input: CreateScheduleInput) {
  const overlapping = await prisma.schedule.findFirst({
    where: {
      doctorId: input.doctorId,
      dayOfWeek: input.dayOfWeek,
      isActive: true,
      startTime: { lt: input.endTime },
      endTime: { gt: input.startTime },
    },
  });
  if (overlapping) throw new Error("This schedule overlaps an existing weekly schedule");

  return prisma.schedule.create({
    data: {
      doctorId: input.doctorId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      slotDuration: input.slotDuration ?? 30,
    },
  });
}

export async function getDoctorSchedules(doctorId: string) {
  return prisma.schedule.findMany({
    where: { doctorId, isActive: true },
    orderBy: { dayOfWeek: "asc" },
  });
}
