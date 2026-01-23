import mysql from "mysql2/promise";
import prisma from "../src/lib/prisma";

const khanzaDb = mysql.createPool({
  host: "100.118.107.102",
  user: "dba",
  password: "DBA_Prasetya99",
  database: "sik",
  waitForConnections: true,
  connectionLimit: 10,
});

async function diagnoseTaskPolling() {
  console.log("=== 1. Cek VisitEvent yang sudah ada ===");
  const visitEvents = await prisma.visitEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const ve of visitEvents) {
    console.log({
      visit_id: ve.visit_id,
      task_progress: ve.task_progress,
    });
  }

  console.log(
    "\n=== 2. Cek data task_id di Khanza untuk visit_id yang sudah diregistrasi ===",
  );
  const visitIds = visitEvents.map((ve) => ve.visit_id);

  if (visitIds.length > 0) {
    const placeholders = visitIds.map(() => "?").join(",");
    const [rows] = await khanzaDb.query(
      `SELECT no_rawat, task_id_3, task_id_4, task_id_5, task_id_6, task_id_7
       FROM reg_periksa 
       WHERE no_rawat IN (${placeholders})`,
      visitIds,
    );

    for (const row of rows as any[]) {
      console.log({
        no_rawat: row.no_rawat,
        task3: row.task_id_3,
        task4: row.task_id_4,
        task5: row.task_id_5,
        task6: row.task_id_6,
        task7: row.task_id_7,
      });
    }
  }

  console.log("\n=== 3. Polling State saat ini ===");
  const states = await prisma.pollingState.findMany();
  for (const state of states) {
    console.log(`${state.source}:`);
    console.log(`  last_event_time: ${state.last_event_time.toISOString()}`);
    console.log(`  pending_cursor: ${state.pending_cursor}`);
  }

  console.log("\n=== 4. Test query fetchTaskId untuk CHECKIN ===");
  // Ambil cursor saat ini untuk CHECKIN
  const checkinState = states.find((s) => s.source === "CHECKIN");
  if (checkinState) {
    const cursor =
      checkinState.pending_cursor ||
      checkinState.last_event_time
        .toISOString()
        .replace("T", " ")
        .substring(0, 19);

    console.log(`Cursor yang digunakan: ${cursor}`);

    const [taskRows] = await khanzaDb.query(
      `SELECT no_rawat, task_id_3 as event_time
       FROM reg_periksa
       WHERE task_id_3 IS NOT NULL AND task_id_3 > ?
       ORDER BY task_id_3 LIMIT 10`,
      [cursor],
    );

    console.log(`Hasil query: ${(taskRows as any[]).length} rows`);
    for (const row of taskRows as any[]) {
      console.log({ no_rawat: row.no_rawat, task3: row.event_time });
    }

    // Coba dengan cursor yang lebih awal
    console.log("\n=== 5. Test dengan cursor 2026-01-01 00:00:00 ===");
    const [testRows] = await khanzaDb.query(
      `SELECT no_rawat, task_id_3 as event_time
       FROM reg_periksa
       WHERE task_id_3 IS NOT NULL AND task_id_3 > ?
       ORDER BY task_id_3 LIMIT 10`,
      ["2026-01-01 00:00:00"],
    );

    console.log(`Hasil query: ${(testRows as any[]).length} rows`);
    for (const row of testRows as any[]) {
      console.log({ no_rawat: row.no_rawat, task3: row.event_time });
    }
  }

  await khanzaDb.end();
  await prisma.$disconnect();
}

diagnoseTaskPolling().catch((e) => {
  console.error(e);
  process.exit(1);
});
