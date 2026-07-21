"use server";

import { prisma } from "@/lib/prisma";
import { getAppointmentHistory, isCancellable } from "@/services/appointmentHistoryService";
import { Prisma } from "@prisma/client";

export async function fetchAppointmentHistory(patientId: string, cursor?: string) {
  return getAppointmentHistory(patientId, cursor);
}

export async function cancelAppointment(appointmentId: string, patientId: string, reason?: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { slot: true } });
  if (!appointment) return { success: false, error: "Appointment not found" };
  if (appointment.patientId !== patientId) return { success: false, error: "Not authorized to cancel this appointment" };
  if (!isCancellable(appointment) || appointment.status !== "CONFIRMED") return { success: false, error: "This appointment can no longer be cancelled" };

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED", cancellationReason: reason } });
    await tx.appointmentSlot.update({ where: { id: appointment.slotId }, data: { isBooked: false } });
    await tx.appointmentAuditLog.create({ data: { appointmentId, action: "CANCELLED_BY_PATIENT", actorRole: "PATIENT", actorId: patientId, reason, fromSlotId: appointment.slotId } });
  });
  return { success: true };
}

export async function cancelAppointmentByDoctor(appointmentId: string, doctorId: string, reason: string) {
  if (!reason.trim()) return { success: false, error: "A cancellation reason is required" };
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return { success: false, error: "Appointment not found" };
  if (appointment.doctorId !== doctorId || appointment.status !== "CONFIRMED") return { success: false, error: "Appointment cannot be cancelled" };
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED", cancellationReason: reason } });
    await tx.appointmentSlot.update({ where: { id: appointment.slotId }, data: { isBooked: false } });
    await tx.appointmentAuditLog.create({ data: { appointmentId, action: "CANCELLED_BY_DOCTOR", actorRole: "DOCTOR", actorId: doctorId, reason, fromSlotId: appointment.slotId } });
  });
  return { success: true };
}

export async function rescheduleAppointment(appointmentId: string, doctorId: string, newSlotId: string, reason?: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment || appointment.doctorId !== doctorId || appointment.status !== "CONFIRMED") throw new Error("Appointment cannot be rescheduled");
      const newSlot = await tx.appointmentSlot.update({ where: { id: newSlotId, doctorId, isBooked: false }, data: { isBooked: true } });
      await tx.appointment.update({ where: { id: appointmentId }, data: { slotId: newSlot.id } });
      await tx.appointmentSlot.update({ where: { id: appointment.slotId }, data: { isBooked: false } });
      await tx.appointmentAuditLog.create({ data: { appointmentId, action: "RESCHEDULED", actorRole: "DOCTOR", actorId: doctorId, reason, fromSlotId: appointment.slotId, toSlotId: newSlot.id } });
    });
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { success: false, error: "The new slot is no longer available" };
    return { success: false, error: error instanceof Error ? error.message : "Unable to reschedule appointment" };
  }
}

export async function setAppointmentOutcome(appointmentId: string, doctorId: string, outcome: "COMPLETED" | "NO_SHOW") {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.doctorId !== doctorId || appointment.status !== "CONFIRMED") return { success: false, error: "Appointment outcome cannot be updated" };
  await prisma.$transaction([
    prisma.appointment.update({ where: { id: appointmentId }, data: { status: outcome } }),
    prisma.appointmentAuditLog.create({ data: { appointmentId, action: outcome === "COMPLETED" ? "COMPLETED" : "MARKED_NO_SHOW", actorRole: "DOCTOR", actorId: doctorId } }),
  ]);
  return { success: true };
}
