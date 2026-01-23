import prisma from "../src/lib/prisma";

async function check() {
  // Cek format jam di DoctorScheduleQuota
  const schedules = await prisma.doctorScheduleQuota.findMany({
    take: 5,
    select: { jam_mulai: true, jam_selesai: true, dokter_id: true },
  });

  console.log("📊 Format jam di DoctorScheduleQuota:");
  schedules.forEach((s) => {
    console.log(
      "   jam_mulai:",
      JSON.stringify(s.jam_mulai),
      "| jam_selesai:",
      JSON.stringify(s.jam_selesai),
      "| dokter_id:",
      JSON.stringify(s.dokter_id),
      typeof s.dokter_id,
    );
  });

  // Cek payload yang sudah di-queue
  const queues = await prisma.bpjsAntreanQueue.findMany({
    where: { status: "PENDING", task_id: 1 },
    take: 3,
    select: { visit_id: true, payload: true },
  });

  console.log("\n📝 Payload di queue:");
  queues.forEach((q) => {
    const p = q.payload as any;
    console.log("   ", q.visit_id);
    console.log(
      "      kodedokter:",
      JSON.stringify(p?.kodedokter),
      typeof p?.kodedokter,
    );
    console.log("      jampraktek:", JSON.stringify(p?.jampraktek));
  });

  await prisma.$disconnect();
}
check();
