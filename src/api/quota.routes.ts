/**
 * Admin routes untuk monitoring dan manual operation
 */

import express from "express";
import type { Router as ExpressRouter } from "express";
import { manualRefreshQuota } from "../scheduler/quota.scheduler";
import { manualSyncPoli } from "../scheduler/poli.scheduler";
import { calculateQuota } from "../domain/quota.aggregator";
import prisma from "../lib/prisma";
import { formatLocalDate } from "../utils/formatDate";
import { serializeBigInt } from "../utils/bigInt";

const router: ExpressRouter = express.Router();

/**
 * POST /admin/quota/refresh
 * Manual refresh jadwal dokter dari BPJS
 *
 * Body:
 * {
 *   "poli": ["ANA", "BED"],
 *   "tanggal": ["2026-01-19", "2026-01-20"]
 * }
 */
router.post("/quota/refresh", async (req, res) => {
  try {
    const { poli, tanggal } = req.body;

    if (!poli || !Array.isArray(poli) || poli.length === 0) {
      return res.status(400).json({
        error: "Parameter 'poli' harus berupa array dan tidak boleh kosong",
      });
    }

    if (!tanggal || !Array.isArray(tanggal) || tanggal.length === 0) {
      return res.status(400).json({
        error: "Parameter 'tanggal' harus berupa array dan tidak boleh kosong",
      });
    }

    // format tanggal
    const formattedTanggal = tanggal.map((t: string) =>
      formatLocalDate(new Date(t)),
    );

    // Jalankan refresh di background
    manualRefreshQuota(poli, formattedTanggal).catch((error) => {
      console.error("Error saat manual refresh:", error);
    });

    res.json(
      serializeBigInt({
        message: "Manual refresh dimulai",
        poli,
        tanggal,
      }),
    );
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /admin/quota/calculate?poli=ANA&dokter=33690&tanggal=2026-01-19
 * Hitung kuota real-time untuk poli/dokter/tanggal tertentu
 */
router.get("/quota/calculate", async (req, res) => {
  try {
    const { poli, dokter, tanggal } = req.query;

    if (!poli || !dokter || !tanggal) {
      return res.status(400).json({
        error: "Parameter 'poli', 'dokter', dan 'tanggal' wajib diisi",
      });
    }

    const quotaInfo = await calculateQuota(
      poli as string,
      dokter as string,
      tanggal as string,
    );

    if (!quotaInfo) {
      return res.status(404).json({
        error:
          "Snapshot jadwal tidak ditemukan. Silakan refresh terlebih dahulu.",
      });
    }

    res.json(quotaInfo);
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /admin/quota/snapshots?tanggal=2026-01-19&poli=ANA
 * Lihat snapshot jadwal yang tersimpan
 */
router.get("/quota/snapshots", async (req, res) => {
  try {
    const { tanggal, poli } = req.query;

    const where: any = {};

    if (tanggal) {
      where.tanggal = new Date(tanggal as string);
    }

    if (poli) {
      where.poli_id = poli;
    }

    const snapshots = await prisma.doctorScheduleQuota.findMany({
      where,
      orderBy: [{ tanggal: "desc" }, { poli_id: "asc" }, { jam_mulai: "asc" }],
      take: 50,
    });

    res.json(
      serializeBigInt({
        total: snapshots.length,
        data: snapshots,
      }),
    );
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /admin/queue/status
 * Monitor status queue
 */
router.get("/queue/status", async (req, res) => {
  try {
    const stats = await prisma.bpjsAntreanQueue.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
    });

    const recentFailed = await prisma.bpjsAntreanQueue.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        visit_id: true,
        task_id: true,
        retry_count: true,
        last_error: true,
        updatedAt: true,
      },
    });

    res.json({
      stats,
      recentFailed,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /admin/poli/sync-manual
 * Manual trigger untuk sinkronisasi data poli dari BPJS
 */
router.post("/poli/sync-manual", async (req, res) => {
  try {
    const result = await manualSyncPoli();

    if (result.success) {
      return res.status(200).json({
        message: result.message,
      });
    } else {
      return res.status(500).json({
        error: result.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /admin/poli/list
 * Lihat daftar poli yang sudah disinkronisasi
 */
router.get("/poli/list", async (req, res) => {
  try {
    const polis = await prisma.poli.findMany({
      orderBy: { poli_id: "asc" },
    });

    res.json({
      total: polis.length,
      data: polis,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;
