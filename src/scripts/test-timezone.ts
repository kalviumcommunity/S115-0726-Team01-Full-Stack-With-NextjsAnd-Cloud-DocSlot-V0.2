import { fetchTodaysAppointments } from "@/actions/doctorDashboardActions";
import { prisma } from "@/lib/prisma";

async function main() {
  const doctor = await prisma.doctor.findFirst({
    include: { schedules: { where: { isActive: true }, take: 1 } },
  });
  const patient = await prisma.patient.findFirst();

  if (!doctor || !patient) {
    throw new Error("Need at least one doctor and one patient. Run prisma/seed-dashboard.ts first.");
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const schedule = doctor.schedules[0];
  if (!schedule) {
    throw new Error(`No active schedule found for doctor ${doctor.id}. Run prisma/seed-dashboard.ts first.`);
  }

  console.log("Server's current time:", now.toString());
  console.log("Server's current UTC time:", now.toISOString());
  console.log("Tomorrow test slot:", tomorrow.toString(), `(${tomorrow.toISOString()})`);

  const tomorrowSlot = await prisma.appointmentSlot.create({
    data: {
      doctorId: doctor.id,
      scheduleId: schedule.id,
      date: tomorrow,
      startTime: "09:00",
      endTime: "09:30",
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      slotId: tomorrowSlot.id,
      status: "CONFIRMED",
    },
  });

  try {
    const { appointments } = await fetchTodaysAppointments(doctor.id);
    const appearsToday = appointments.some((item) => item.id === appointment.id);

    if (appearsToday) {
      throw new Error("FAIL: Tomorrow's appointment appeared in today's list.");
    }

    console.log("PASS: Tomorrow's CONFIRMED appointment is excluded from today's list.");
  } finally {
    await prisma.appointment.delete({ where: { id: appointment.id } });
    await prisma.appointmentSlot.delete({ where: { id: tomorrowSlot.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
