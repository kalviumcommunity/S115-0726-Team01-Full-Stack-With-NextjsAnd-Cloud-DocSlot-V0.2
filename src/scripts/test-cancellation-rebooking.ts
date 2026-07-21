import { bookAppointment } from "@/actions/bookingActions";
import { cancelAppointment } from "@/actions/appointmentActions";
import { prisma } from "@/lib/prisma";

async function main() {
  const [patient, doctor] = await Promise.all([prisma.patient.findFirst({ include: { user: true } }), prisma.doctor.findFirst()]);
  if (!patient || !doctor) throw new Error("A patient and doctor are required for this integration test");

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  date.setUTCHours(0, 0, 0, 0);
  const slot = await prisma.appointmentSlot.create({
    data: { doctorId: doctor.id, date, startTime: "23:00", endTime: "23:30" },
  });

  try {
    const bookingInput = {
      patientId: patient.id, doctorId: doctor.id, slotId: slot.id, reason: "cancellation lifecycle test",
      patientName: patient.user.name, patientEmail: patient.user.email, patientPhone: patient.user.phone ?? "0000000000",
    };
    const first = await bookAppointment(bookingInput);
    if (!first.success || !first.appointmentId) throw new Error("Initial booking failed");
    const cancelled = await cancelAppointment(first.appointmentId, patient.id, "test cancellation");
    if (!cancelled.success) throw new Error("Cancellation failed");
    const released = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } });
    if (released.isBooked) throw new Error("Cancelled slot was not released");
    const second = await bookAppointment({ ...bookingInput, reason: "rebooking test" });
    if (!second.success) throw new Error("Released slot could not be rebooked");
    console.log("PASS: cancellation releases the slot and permits a new booking.");
  } finally {
    await prisma.appointment.deleteMany({ where: { slotId: slot.id } });
    await prisma.appointmentSlot.delete({ where: { id: slot.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
