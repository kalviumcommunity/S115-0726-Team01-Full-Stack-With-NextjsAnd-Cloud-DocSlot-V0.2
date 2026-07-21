import { prisma } from "../src/lib/prisma";

export async function seedTodaysAppointments() {
  const patient = await prisma.patient.findFirst();
  const doctor = await prisma.doctor.findFirst();

  if (!patient || !doctor) {
    console.log("Need at least 1 patient and 1 doctor first.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedule = await prisma.schedule.create({
    data: {
      doctorId: doctor.id,
      dayOfWeek: today.getDay(),
      startTime: "10:00",
      endTime: "12:00",
      slotDuration: 30,
    },
  });

  const slot = await prisma.appointmentSlot.create({
    data: {
      doctorId: doctor.id,
      scheduleId: schedule.id,
      date: today,
      startTime: "10:00",
      endTime: "10:30",
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      slotId: slot.id,
      status: "CONFIRMED",
    },
  });

  console.log("Seeded today's appointment:", appointment);
}

seedTodaysAppointments();
