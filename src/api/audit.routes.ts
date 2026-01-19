/**
 * Admin routes untuk audit dan manage blocked events
 */

import express, { Router } from "express";
import type { Router as ExpressRouter } from "express";
import prisma from "../lib/prisma";
import { validateRegistration } from "../domain/hfis.validator";

const router: ExpressRouter = express.Router();

/**
 * GET /admin/events/blocked
 * Lihat semua event yang BLOCKED_BPJS
 */
router.get("/events/blocked", async (req, res) => {
  try {
    const { limit = "50", offset = "0" } = req.query;

    const events = await prisma.visitEvent.findMany({
      where: {
        status: "BLOCKED_BPJS",
      },
      orderBy: {
        event_time: "desc",
      },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      select: {
        id: true,
        visit_id: true,
        event_type: true,
        event_time: true,
        poli_id: true,
        dokter_id: true,
        nomor_antrean: true,
        blocked_reason: true,
        createdAt: true,
      },
    });

    const total = await prisma.visitEvent.count({
      where: { status: "BLOCKED_BPJS" },
    });

    res.json({
      total,
      data: events,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + parseInt(limit as string),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/events/:id/revalidate
 * Revalidasi event yang BLOCKED_BPJS
 */
router.post("/events/:id/revalidate", async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.visitEvent.findUnique({
      where: { id: BigInt(id) },
    });

    if (!event) {
      return res.status(404).json({ error: "Event tidak ditemukan" });
    }

    if (event.status !== "BLOCKED_BPJS") {
      return res.status(400).json({
        error: `Event status bukan BLOCKED_BPJS (current: ${event.status})`,
      });
    }

    // Revalidasi
    const validation = await validateRegistration(
      event.poli_id,
      event.dokter_id,
      event.tanggal.toISOString().slice(0, 10),
      event.nomor_antrean || "",
      event.visit_id,
    );

    // Update status
    const updated = await prisma.visitEvent.update({
      where: { id: BigInt(id) },
      data: {
        status: validation.status,
        blocked_reason: validation.blockedReason,
      },
    });

    res.json({
      message: `Event ${id} revalidated`,
      previous_status: "BLOCKED_BPJS",
      new_status: updated.status,
      blocked_reason: updated.blocked_reason,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/events/revalidate-all
 * Revalidasi semua event yang BLOCKED_BPJS
 */
router.post("/events/revalidate-all", async (req, res) => {
  try {
    const events = await prisma.visitEvent.findMany({
      where: { status: "BLOCKED_BPJS" },
      take: 100, // Batch 100
    });

    let revalidated = 0;
    let nowReady = 0;
    let stillBlocked = 0;

    for (const event of events) {
      const validation = await validateRegistration(
        event.poli_id,
        event.dokter_id,
        event.tanggal.toISOString().slice(0, 10),
        event.nomor_antrean || "",
        event.visit_id,
      );

      await prisma.visitEvent.update({
        where: { id: event.id },
        data: {
          status: validation.status,
          blocked_reason: validation.blockedReason,
        },
      });

      revalidated++;
      if (validation.status === "READY_BPJS") {
        nowReady++;
      } else {
        stillBlocked++;
      }
    }

    res.json({
      message: "Revalidation completed",
      processed: revalidated,
      now_ready: nowReady,
      still_blocked: stillBlocked,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/events/stats
 * Statistik status events
 */
router.get("/events/stats", async (req, res) => {
  try {
    const stats = await prisma.visitEvent.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
    });

    const formatted = stats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
