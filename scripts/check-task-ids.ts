import mysql from "mysql2/promise";
import prisma from "../src/lib/prisma";

// Connect langsung ke Khanza dengan hardcoded credentials untuk script debug
const khanzaDb = mysql.createPool({
  host: "100.118.107.102",
  user: "dba",
  password: "DBA_Prasetya99",
  database: "sik",
  waitForConnections: true,
  connectionLimit: 10,
});

async function checkTaskIds() {
  // Check kolom task_id di reg_periksa
  const [rows] = await khanzaDb.query(`
    SELECT 
      no_rawat, 
      tgl_registrasi,
      task_id_3,
      task_id_4,
      task_id_5,
      task_id_6,
      task_id_7
    FROM reg_periksa
    WHERE kd_pj = 'BPJ'
    AND tgl_registrasi >= '2026-01-22'
    LIMIT 10
  `);

  console.log("=== Data task_id di reg_periksa (Khanza) ===");
  for (const row of rows as any[]) {
    console.log({
      no_rawat: row.no_rawat,
      tgl: row.tgl_registrasi,
      task3: row.task_id_3,
      task4: row.task_id_4,
      task5: row.task_id_5,
      task6: row.task_id_6,
      task7: row.task_id_7,
    });
  }

  // Check polling state untuk CHECKIN, etc
  console.log("\n=== Polling State di database service ===");
  const states = await prisma.pollingState.findMany();
  for (const state of states) {
    console.log({
      source: state.source,
      last_event_time: state.last_event_time,
      pending_cursor: state.pending_cursor,
      batch_count: state.batch_count,
    });
  }

  // Check struktur tabel reg_periksa - apakah task_id_3 ada?
  console.log("\n=== Struktur kolom task_id di reg_periksa ===");
  const [columns] = await khanzaDb.query(`
    SHOW COLUMNS FROM reg_periksa LIKE 'task_id%'
  `);
  console.log(columns);

  await khanzaDb.end();
  await prisma.$disconnect();
}

checkTaskIds().catch((e) => {
  console.error(e);
  process.exit(1);
});
