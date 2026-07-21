import { prisma } from "../lib/prisma";
import { getAppointmentHistory } from "../services/appointmentHistoryService";

async function main() {
  const patient = await prisma.patient.findFirst();

  if (!patient) {
    console.log("No patient found — run your seed scripts first.");
    return;
  }

  console.log("Testing pagination for patientId:", patient.id);

  // Page 1 — no cursor
  const page1 = await getAppointmentHistory(patient.id);
  console.log("\n--- PAGE 1 ---");
  console.log("Items:", page1.items.map((a) => ({ id: a.id, status: a.status, createdAt: a.createdAt })));
  console.log("nextCursor:", page1.nextCursor);

  if (!page1.nextCursor) {
    console.log("\nNo nextCursor returned — either you have <= PAGE_SIZE appointments, or something's off. Seed more rows if you expect a second page.");
    return;
  }

  // Page 2 — using cursor from page 1
  const page2 = await getAppointmentHistory(patient.id, page1.nextCursor);
  console.log("\n--- PAGE 2 ---");
  console.log("Items:", page2.items.map((a) => ({ id: a.id, status: a.status, createdAt: a.createdAt })));
  console.log("nextCursor:", page2.nextCursor);

  // Sanity check — no overlap between the two pages
  const page1Ids = new Set(page1.items.map((a) => a.id));
  const overlap = page2.items.filter((a) => page1Ids.has(a.id));

  console.log("\n--- CHECK ---");
  console.log(overlap.length === 0 ? "✅ No overlap — pagination is working." : `❌ Overlap found: ${overlap.length} repeated item(s)`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
