-- Doctor-local availability and exception support.
ALTER TABLE "Doctor" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

CREATE TYPE "AvailabilityExceptionType" AS ENUM ('LEAVE', 'HOLIDAY', 'BLOCKED', 'EXTRA_HOURS');
CREATE TYPE "AppointmentAuditAction" AS ENUM ('BOOKED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR', 'RESCHEDULED', 'COMPLETED', 'MARKED_NO_SHOW');

ALTER TABLE "Appointment" ADD COLUMN "cancellationReason" TEXT;
DROP INDEX "Appointment_slotId_key";
CREATE INDEX "Appointment_slotId_idx" ON "Appointment"("slotId");

CREATE TABLE "AvailabilityException" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "type" "AvailabilityExceptionType" NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentAuditLog" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "action" "AppointmentAuditAction" NOT NULL,
  "actorRole" "Role",
  "actorId" TEXT,
  "reason" TEXT,
  "fromSlotId" TEXT,
  "toSlotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentAuditLog_pkey" PRIMARY KEY ("id")
);

-- Existing slots inherit their doctor from their schedule before the relation is relaxed.
ALTER TABLE "AppointmentSlot" ADD COLUMN "doctorId" TEXT;
ALTER TABLE "AppointmentSlot" ADD COLUMN "exceptionId" TEXT;
UPDATE "AppointmentSlot" AS slot SET "doctorId" = schedule."doctorId"
FROM "Schedule" AS schedule WHERE slot."scheduleId" = schedule."id";
ALTER TABLE "AppointmentSlot" ALTER COLUMN "doctorId" SET NOT NULL;
ALTER TABLE "AppointmentSlot" ALTER COLUMN "scheduleId" DROP NOT NULL;
DROP INDEX "AppointmentSlot_scheduleId_date_startTime_key";
CREATE INDEX "AppointmentSlot_doctorId_date_startTime_idx" ON "AppointmentSlot"("doctorId", "date", "startTime");
CREATE INDEX "AppointmentSlot_doctorId_date_idx" ON "AppointmentSlot"("doctorId", "date");
CREATE INDEX "AvailabilityException_doctorId_startDate_endDate_idx" ON "AvailabilityException"("doctorId", "startDate", "endDate");
CREATE INDEX "AppointmentAuditLog_appointmentId_createdAt_idx" ON "AppointmentAuditLog"("appointmentId", "createdAt");
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentSlot" ADD CONSTRAINT "AppointmentSlot_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "AvailabilityException"("id") ON DELETE CASCADE ON UPDATE CASCADE;
