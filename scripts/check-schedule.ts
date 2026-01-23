import prisma from "../src/lib/prisma";

async function check() {
  // Cek tanggal apa saja yang ada di DoctorScheduleQuota
  const schedules = await prisma.doctorScheduleQuota.findMany({
    orderBy: { tanggal: "desc" },
    take: 20,
    select: {
      poli_id: true,
      dokter_id: true,
      tanggal: true,
      jam_mulai: true,
      jam_selesai: true,
      kuota_jkn: true,
    },
  });

  console.log("📊 DoctorScheduleQuota tersedia:");
  console.log(`   Total records: ${schedules.length}`);

  const uniqueDates = [
    ...new Set(schedules.map((s) => s.tanggal.toISOString().slice(0, 10))),
  ];
  console.log(`   Tanggal tersedia: ${uniqueDates.join(", ")}`);

  console.log("\n📝 Sample data:");
  schedules.slice(0, 10).forEach((s) => {
    console.log(
      `   ${s.tanggal.toISOString().slice(0, 10)} | ${s.poli_id} | ${s.dokter_id} | ${s.jam_mulai}-${s.jam_selesai} | kuota: ${s.kuota_jkn}`,
    );
  });

  // Cek tanggal apa yang ada di VisitEvent
  const visitDates = await prisma.visitEvent.findMany({
    distinct: ["tanggal"],
    select: { tanggal: true },
    orderBy: { tanggal: "desc" },
  });

  console.log("\n🗓️ Tanggal di VisitEvent:");
  visitDates.forEach((v) => {
    console.log(`   ${v.tanggal.toISOString().slice(0, 10)}`);
  });

  // Cek sample VisitEvent dengan poli/dokter
  const visits = await prisma.visitEvent.findMany({
    take: 5,
    orderBy: { event_time: "desc" },
    select: {
      visit_id: true,
      poli_id: true,
      dokter_id: true,
      tanggal: true,
    },
  });

  console.log("\n🏥 Sample VisitEvent (untuk cek matching):");
  for (const v of visits) {
    const schedule = await prisma.doctorScheduleQuota.findFirst({
      where: {
        poli_id: v.poli_id,
        dokter_id: v.dokter_id,
        tanggal: v.tanggal,
      },
    });
    const hasSchedule = schedule ? "✅" : "❌";
    console.log(
      `   ${v.visit_id} | ${v.tanggal.toISOString().slice(0, 10)} | poli: ${v.poli_id} | dokter: ${v.dokter_id} | schedule: ${hasSchedule}`,
    );
  }

  await prisma.$disconnect();
}

check();
