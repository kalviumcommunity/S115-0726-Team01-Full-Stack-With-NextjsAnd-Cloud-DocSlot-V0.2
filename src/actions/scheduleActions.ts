"use server";

import { prisma } from "@/lib/prisma";
import { createWeeklySchedule } from "@/services/scheduleService";
import { generateSlotsForSchedule, generateSlotsForExtraHours, regenerateSlotsForSchedule } from "@/services/slotService";
import { z } from "zod";

const scheduleSchema = z.object({
  doctorId: z.string().min(1),
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format"),
  slotDuration: z.number().min(10).max(120).default(30),
});

export async function createSchedule(input: z.infer<typeof scheduleSchema>) {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.startTime >= parsed.data.endTime) {
    return { success: false, errors: { endTime: ["End time must be after start time"] } };
  }

  try {
    const schedule = await createWeeklySchedule(parsed.data);
    await generateSlotsForSchedule(schedule.id);
    return { success: true, scheduleId: schedule.id };
  } catch (error) {
    return { success: false, errors: { startTime: [error instanceof Error ? error.message : "Unable to create schedule"] } };
  }
}

export async function updateSchedule(scheduleId: string, input: Partial<z.infer<typeof scheduleSchema>>) {
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: input,
  });

  await regenerateSlotsForSchedule(scheduleId);

  return { success: true };
}

const exceptionSchema = z.object({
  doctorId: z.string().min(1),
  type: z.enum(["LEAVE", "HOLIDAY", "BLOCKED", "EXTRA_HOURS"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  reason: z.string().max(500).optional(),
});

export async function createAvailabilityException(input: z.infer<typeof exceptionSchema>) {
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate ||
    (parsed.data.startTime && parsed.data.endTime && parsed.data.startTime >= parsed.data.endTime)) {
    return { success: false, error: "Invalid exception date or time range" };
  }
  if (parsed.data.type === "EXTRA_HOURS" && (!parsed.data.startTime || !parsed.data.endTime)) {
    return { success: false, error: "Extra hours require a start and end time" };
  }
  const exception = await prisma.availabilityException.create({ data: parsed.data });
  if (exception.type === "EXTRA_HOURS") await generateSlotsForExtraHours(exception.id);
  else {
    await prisma.appointmentSlot.deleteMany({
      where: { doctorId: exception.doctorId, isBooked: false, date: { gte: exception.startDate, lte: exception.endDate },
        ...(exception.startTime && exception.endTime ? { startTime: { gte: exception.startTime, lt: exception.endTime } } : {}) },
    });
  }
  return { success: true, exceptionId: exception.id };
}
