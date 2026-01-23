import "dotenv/config";
import prisma from "../src/lib/prisma";
import { validateAndGetHfisData } from "../src/domain/hfis.validator";

async function testAutoFetch() {
  console.log("=== Test Auto-Fetch Snapshot ===\n");

  // Hapus snapshot untuk test - pilih hari Kamis (ada jadwal)
  const testDate = "2026-01-29"; // Kamis
  const testPoli = "INT";
  const testDokter = "262077";

  console.log(
    `1. Hapus snapshot untuk ${testPoli}/${testDokter}/${testDate}...`,
  );
  const deleted = await prisma.doctorScheduleQuota.deleteMany({
    where: {
      poli_id: testPoli,
      dokter_id: testDokter,
      tanggal: new Date(testDate),
    },
  });
  console.log(`   Deleted: ${deleted.count} records\n`);

  console.log(`2. Validasi data (seharusnya auto-fetch)...`);
  const result = await validateAndGetHfisData(
    testPoli,
    testDokter,
    testDate,
    "001",
    "2026/01/24/000001",
  );

  console.log("\n3. Hasil validasi:");
  console.log({
    isValid: result.isValid,
    status: result.status,
    blockedReason: result.blockedReason,
    hfisData: result.hfisData
      ? {
          poli_id: result.hfisData.poli_id,
          dokter_id: result.hfisData.dokter_id,
          jam_praktek: result.hfisData.jam_praktek,
          kuota_jkn: result.hfisData.kuota_jkn,
        }
      : undefined,
  });

  console.log("\n4. Cek snapshot sekarang ada di database...");
  const snapshot = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: testPoli,
      dokter_id: testDokter,
      tanggal: new Date(testDate),
    },
  });

  if (snapshot) {
    console.log("   ✅ Snapshot berhasil disimpan:");
    console.log({
      poli_id: snapshot.poli_id,
      dokter_id: snapshot.dokter_id,
      nama_dokter: snapshot.nama_dokter,
      jam: `${snapshot.jam_mulai}-${snapshot.jam_selesai}`,
      kuota: snapshot.kuota_jkn,
      source: snapshot.source,
    });
  } else {
    console.log("   ❌ Snapshot tidak ditemukan!");
  }

  await prisma.$disconnect();
}

testAutoFetch().catch((e) => {
  console.error(e);
  process.exit(1);
});
