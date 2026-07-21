import { prisma } from "@/lib/prisma";

const DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string) {
  let formatter = DATE_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    DATE_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

/** A date-only value is stored at midnight UTC, representing the doctor's local calendar day. */
export function localCalendarDate(date: Date, timeZone: string): Date {
  const parts = dateFormatter(timeZone).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function buildSlots(startTime: string, endTime: string, duration: number) {
  const slots: { startTime: string; endTime: string }[] = [];
  for (let current = startTime; current < endTime;) {
    const end = addMinutes(current, duration);
    if (end > endTime) break;
    slots.push({ startTime: current, endTime: end });
    current = end;
  }
  return slots;
}

function isBlocked(
  date: Date,
  startTime: string,
  exceptions: { type: string; startDate: Date; endDate: Date; startTime: string | null; endTime: string | null }[],
) {
  return exceptions.some((exception) =>
    exception.type !== "EXTRA_HOURS" && date >= exception.startDate && date <= exception.endDate &&
    (!exception.startTime || !exception.endTime || (startTime >= exception.startTime && startTime < exception.endTime)),
  );
}

async function createMissingSlots<T extends { doctorId: string; date: Date; startTime: string; endTime: string }>(data: T[]) {
  if (!data.length) return { count: 0 };
  const dates = data.map((slot) => slot.date);
  const existing = await prisma.appointmentSlot.findMany({
    where: { doctorId: data[0].doctorId, date: { gte: new Date(Math.min(...dates.map(Number))), lte: new Date(Math.max(...dates.map(Number))) } },
    select: { date: true, startTime: true },
  });
  const keys = new Set(existing.map((slot) => `${slot.date.toISOString()}|${slot.startTime}`));
  return prisma.appointmentSlot.createMany({ data: data.filter((slot) => !keys.has(`${slot.date.toISOString()}|${slot.startTime}`)), skipDuplicates: true });
}

export async function generateSlotsForSchedule(scheduleId: string, daysAhead = 56) {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId }, include: { doctor: true } });
  if (!schedule || !schedule.isActive) throw new Error("Active schedule not found");

  const today = localCalendarDate(new Date(), schedule.doctor.timezone);
  const until = addDays(today, daysAhead);
  const exceptions = await prisma.availabilityException.findMany({
    where: { doctorId: schedule.doctorId, startDate: { lte: until }, endDate: { gte: today } },
  });
  const data: { doctorId: string; scheduleId: string; date: Date; startTime: string; endTime: string }[] = [];

  for (let date = today; date <= until; date = addDays(date, 1)) {
    if (date.getUTCDay() !== schedule.dayOfWeek) continue;
    for (const slot of buildSlots(schedule.startTime, schedule.endTime, schedule.slotDuration)) {
      if (!isBlocked(date, slot.startTime, exceptions)) {
        data.push({ doctorId: schedule.doctorId, scheduleId: schedule.id, date, ...slot });
      }
    }
  }
  return createMissingSlots(data);
}

export async function generateSlotsForExtraHours(exceptionId: string, slotDuration = 30) {
  const exception = await prisma.availabilityException.findUnique({ where: { id: exceptionId } });
  if (!exception || exception.type !== "EXTRA_HOURS" || !exception.startTime || !exception.endTime) {
    throw new Error("Extra-hours exception with a time range is required");
  }
  const data: { doctorId: string; exceptionId: string; date: Date; startTime: string; endTime: string }[] = [];
  for (let date = exception.startDate; date <= exception.endDate; date = addDays(date, 1)) {
    for (const slot of buildSlots(exception.startTime, exception.endTime, slotDuration)) {
      data.push({ doctorId: exception.doctorId, exceptionId: exception.id, date, ...slot });
    }
  }
  return createMissingSlots(data);
}

/** Invoked by a daily scheduler; keeps every active doctor's availability 56 days ahead. */
export async function extendSlotHorizon(daysAhead = 56) {
  const schedules = await prisma.schedule.findMany({ where: { isActive: true }, select: { id: true } });
  await Promise.all(schedules.map(({ id }) => generateSlotsForSchedule(id, daysAhead)));
  return { schedulesProcessed: schedules.length };
}

export async function regenerateSlotsForSchedule(scheduleId: string, daysAhead = 56) {
  await prisma.appointmentSlot.deleteMany({ where: { scheduleId, isBooked: false, date: { gte: localCalendarDate(new Date(), "UTC") } } });
  return generateSlotsForSchedule(scheduleId, daysAhead);
}
