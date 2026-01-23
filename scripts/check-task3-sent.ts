import prisma from "../src/lib/prisma";

async function checkTask3SentEvents() {
  // Cek VisitEvent untuk visit_id yang task 3 sudah SEND
  const sentVisitIds = [
    "2026/01/22/005345",
    "2026/01/22/005344",
    "2026/01/22/005343",
    "2026/01/22/005342",
  ];

  console.log("=== VisitEvent untuk queue task 3 yang sudah SEND ===\n");

  for (const visitId of sentVisitIds) {
    const event = await prisma.visitEvent.findUnique({
      where: { visit_id: visitId },
    });

    if (event) {
      const tp = event.task_progress as any;
      console.log({
        visit_id: event.visit_id,
        task1: tp?.["1"],
        task3: tp?.["3"],
      });
    } else {
      console.log(`${visitId}: tidak ditemukan`);
    }
  }

  await prisma.$disconnect();
}

checkTask3SentEvents().catch((e) => {
  console.error(e);
  process.exit(1);
});
