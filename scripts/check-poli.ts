import prisma from "../src/lib/prisma";

async function check() {
  const poliCount = await prisma.poli.count();
  console.log("📊 Jumlah Poli di database:", poliCount);

  const polis = await prisma.poli.findMany({ take: 10 });
  console.log("\n📝 Sample Poli:");
  polis.forEach((p) => console.log("   ", p.poli_id, "-", p.nama));

  // Lihat poli yang dibutuhkan dari VisitEvent
  const neededPolis = await prisma.visitEvent.findMany({
    distinct: ["poli_id"],
    select: { poli_id: true },
  });
  console.log(
    "\n🏥 Poli yang dibutuhkan:",
    neededPolis.map((p) => p.poli_id).join(", "),
  );

  await prisma.$disconnect();
}

check();
