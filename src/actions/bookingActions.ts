"use server";

import { prisma } from "@/lib/prisma";
import { bookingSchema, type BookingInput } from "@/validations/bookingSchema";
import { Prisma } from "@prisma/client";

export async function bookAppointment(input: BookingInput & { patientId: string; doctorId: string }) {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const slot = await prisma.appointmentSlot.findUnique({
    where: { id: parsed.data.slotId },
  });

  if (!slot) {
    return { success: false, errors: { slotId: ["This slot no longer exists"] } };
  }

  if (slot.doctorId !== input.doctorId) {
    return { success: false, errors: { slotId: ["This slot does not belong to the selected doctor"] } };
  }

  if (slot.isBooked) {
    return { success: false, errors: { slotId: ["This slot was just taken — please pick another"] } };
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const updatedSlot = await tx.appointmentSlot.update({
        where: { id: parsed.data.slotId, isBooked: false },
        data: { isBooked: true },
      });

      return tx.appointment.create({
        data: {
          patientId: input.patientId,
          doctorId: input.doctorId,
          slotId: updatedSlot.id,
          reason: parsed.data.reason || undefined,
          status: "CONFIRMED",
        },
      });
    });

    await prisma.appointmentAuditLog.create({
      data: { appointmentId: appointment.id, action: "BOOKED", actorRole: "PATIENT", actorId: input.patientId, toSlotId: slot.id },
    });

    return { success: true, appointmentId: appointment.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025" || error.code === "P2002") {
        return { success: false, errors: { slotId: ["This slot was just taken — please pick another"] } };
      }
    }
    throw error;
  }
}
