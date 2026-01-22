/**
 * Script untuk cleanup data yang corrupt
 *
 * Usage:
 *   npx ts-node scripts/cleanup-data.ts backup   // Backup dulu
 *   npx ts-node scripts/cleanup-data.ts clean    // Delete data
 *   npx ts-node scripts/cleanup-data.ts reset    // Reset cursor
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import prisma from "../src/lib/prisma";
import { serializeBigInt } from "../src/utils/bigInt";

const execAsync = promisify(exec);

async function backupData() {
  console.log("📦 Backing up VisitEvent and BpjsAntreanQueue...");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "backups");

  // Create backup directory jika tidak ada
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    // Backup VisitEvent
    const visitEvents = await prisma.visitEvent.findMany();
    const visitEventFile = path.join(backupDir, `visitEvent-${timestamp}.json`);
    fs.writeFileSync(
      visitEventFile,
      JSON.stringify(serializeBigInt(visitEvents), null, 2),
    );
    console.log(
      `✅ Backed up ${visitEvents.length} VisitEvent records to ${visitEventFile}`,
    );

    // Backup BpjsAntreanQueue
    const queueJobs = await prisma.bpjsAntreanQueue.findMany();
    const queueFile = path.join(
      backupDir,
      `bpjsAntreanQueue-${timestamp}.json`,
    );
    fs.writeFileSync(
      queueFile,
      JSON.stringify(serializeBigInt(queueJobs), null, 2),
    );
    console.log(
      `✅ Backed up ${queueJobs.length} BpjsAntreanQueue records to ${queueFile}`,
    );

    // Backup PollingState
    const pollingStates = await prisma.pollingState.findMany();
    const pollingFile = path.join(backupDir, `pollingState-${timestamp}.json`);
    fs.writeFileSync(
      pollingFile,
      JSON.stringify(serializeBigInt(pollingStates), null, 2),
    );
    console.log(`✅ Backed up PollingState to ${pollingFile}`);
  } catch (error: any) {
    console.error("❌ Backup error:", error.message);
    throw error;
  }
}

async function cleanData() {
  console.log("🗑️  Deleting corrupt data...");

  try {
    // Delete BpjsAntreanQueue first (FK constraint)
    const queueDeleted = await prisma.bpjsAntreanQueue.deleteMany({});
    console.log(`✅ Deleted ${queueDeleted.count} BpjsAntreanQueue records`);

    // Delete BpjsAntreanLogs
    const logsDeleted = await prisma.bpjsAntreanLogs.deleteMany({});
    console.log(`✅ Deleted ${logsDeleted.count} BpjsAntreanLogs records`);

    // Delete VisitEvent
    const eventDeleted = await prisma.visitEvent.deleteMany({});
    console.log(`✅ Deleted ${eventDeleted.count} VisitEvent records`);
  } catch (error: any) {
    console.error("❌ Delete error:", error.message);
    throw error;
  }
}

async function resetCursor() {
  console.log("🔄 Resetting PollingState cursor...");

  try {
    // Reset REGISTER polling state
    const updated = await prisma.pollingState.updateMany({
      data: {
        last_event_time: new Date("2026-01-01T00:00:00Z"),
        pending_cursor: null,
        batch_count: 0,
      },
    });

    console.log(`✅ Reset ${updated.count} PollingState records`);
    console.log("   - last_event_time: 2026-01-01T00:00:00Z");
    console.log("   - pending_cursor: null");
    console.log("   - batch_count: 0");
  } catch (error: any) {
    console.error("❌ Reset error:", error.message);
    throw error;
  }
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log(`
Usage:
  npx ts-node scripts/cleanup-data.ts backup   # Backup data to backups/
  npx ts-node scripts/cleanup-data.ts clean    # Delete corrupt data
  npx ts-node scripts/cleanup-data.ts reset    # Reset cursor to start
  npx ts-node scripts/cleanup-data.ts all      # Backup + Clean + Reset
    `);
    process.exit(1);
  }

  try {
    switch (command) {
      case "backup":
        await backupData();
        break;
      case "clean":
        console.log(
          "⚠️  WARNING: This will delete all VisitEvent and queue data!",
        );
        console.log(
          "If you want to backup first, run: npx ts-node scripts/cleanup-data.ts backup",
        );
        console.log("");

        // Simple confirmation
        const answer = await new Promise<string>((resolve) => {
          process.stdout.write("Type 'yes' to confirm deletion: ");
          process.stdin.setEncoding("utf-8");
          process.stdin.once("data", (data) => {
            resolve(data.toString().trim());
          });
        });

        if (answer === "yes") {
          await cleanData();
        } else {
          console.log("❌ Cancelled.");
          process.exit(1);
        }
        break;
      case "reset":
        await resetCursor();
        break;
      case "all":
        console.log("🚀 Running full cleanup: backup → clean → reset");
        console.log("");

        await backupData();
        console.log("");

        const confirm = await new Promise<string>((resolve) => {
          process.stdout.write(
            "Backup done. Type 'yes' to proceed with deletion: ",
          );
          process.stdin.setEncoding("utf-8");
          process.stdin.once("data", (data) => {
            resolve(data.toString().trim());
          });
        });

        if (confirm === "yes") {
          console.log("");
          await cleanData();
          console.log("");
          await resetCursor();
          console.log("");
          console.log("✅ Full cleanup completed!");
        } else {
          console.log("❌ Cancelled. Backup file saved, no data deleted.");
          process.exit(1);
        }
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
