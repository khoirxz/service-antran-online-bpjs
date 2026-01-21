/**
 * Admin routes untuk audit dan manage blocked events
 */

import express from "express";
import type { Router as ExpressRouter } from "express";
import prisma from "../lib/prisma";
import { validateRegistration } from "../domain/hfis.validator";
import { updateTaskProgress, getTaskProgress } from "../domain/task.progress";
import { retryFailedJob } from "../queue/queue.worker";
import { serializeBigInt } from "../utils/bigInt";
import { formatLocalDate } from "../utils/formatDate";

const router: ExpressRouter = express.Router();

/**
 * GET /admin/events/blocked
 * Lihat semua event yang task_progress["1"].status = BLOCKED_BPJS
 * Query params: limit, offset, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/events/blocked", async (req, res) => {
  try {
    const { limit = "50", offset = "0", startDate, endDate } = req.query;

    // Build where clause dengan date filter
    const whereClause: any = {};
    if (startDate || endDate) {
      whereClause.event_time = {};
      if (startDate) {
        whereClause.event_time.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.event_time.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const events = await prisma.visitEvent.findMany({
      where: whereClause,
      orderBy: {
        event_time: "desc",
      },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
    });

    // Filter untuk events yang task_progress["1"].status = BLOCKED_BPJS
    const blockedEvents = events
      .filter((event) => {
        const progress = getTaskProgress(event.task_progress);
        return progress["1"]?.status === "BLOCKED_BPJS";
      })
      .map((event) => {
        const progress = getTaskProgress(event.task_progress);
        return {
          id: event.id,
          visit_id: event.visit_id,
          event_time: event.event_time,
          poli_id: event.poli_id,
          dokter_id: event.dokter_id,
          nomor_antrean: event.nomor_antrean,
          blocked_reason: progress["1"]?.blocked_reason,
          createdAt: event.createdAt,
        };
      });

    const total = events.filter((event) => {
      const progress = getTaskProgress(event.task_progress);
      return progress["1"]?.status === "BLOCKED_BPJS";
    }).length;

    res.json(
      serializeBigInt({
        total,
        data: blockedEvents,
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore:
            total > parseInt(offset as string) + parseInt(limit as string),
        },
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/events/:id/revalidate
 * Revalidasi event yang task_progress["1"].status = BLOCKED_BPJS
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

    const progress = getTaskProgress(event.task_progress);
    if (progress["1"]?.status !== "BLOCKED_BPJS") {
      return res.status(400).json({
        error: `Event status bukan BLOCKED_BPJS (current: ${progress["1"]?.status})`,
      });
    }

    // Revalidasi
    const tanggal = formatLocalDate(event.tanggal);
    const validation = await validateRegistration(
      event.poli_id,
      event.dokter_id,
      tanggal,
      event.nomor_antrean || "",
      event.visit_id,
    );

    // Update task_progress["1"]
    const newProgress = updateTaskProgress(
      event.task_progress,
      1,
      validation.status,
      validation.blockedReason,
    );

    const updated = await prisma.visitEvent.update({
      where: { id: BigInt(id) },
      data: {
        task_progress: newProgress as any,
      },
    });

    const updatedProgress = getTaskProgress(updated.task_progress);

    res.json(
      serializeBigInt({
        message: `Event ${id} revalidated`,
        previous_status: "BLOCKED_BPJS",
        new_status: updatedProgress["1"]?.status,
        blocked_reason: updatedProgress["1"]?.blocked_reason,
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/events/revalidate-all
 * Revalidasi semua event yang task_progress["1"].status = BLOCKED_BPJS
 */
router.post("/events/revalidate-all", async (req, res) => {
  try {
    const events = await prisma.visitEvent.findMany({
      take: 100, // Batch 100
    });

    const blockedEvents = events.filter((event) => {
      const progress = getTaskProgress(event.task_progress);
      return progress["1"]?.status === "BLOCKED_BPJS";
    });

    let revalidated = 0;
    let nowReady = 0;
    let stillBlocked = 0;

    for (const event of blockedEvents) {
      const tanggal = formatLocalDate(event.tanggal);
      const validation = await validateRegistration(
        event.poli_id,
        event.dokter_id,
        tanggal,
        event.nomor_antrean || "",
        event.visit_id,
      );

      const newProgress = updateTaskProgress(
        event.task_progress,
        1,
        validation.status,
        validation.blockedReason,
      );

      await prisma.visitEvent.update({
        where: { id: event.id },
        data: {
          task_progress: newProgress as any,
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
 * Statistik status events berdasarkan task_progress["1"]
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/events/stats", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build where clause dengan date filter
    const whereClause: any = {};
    if (startDate || endDate) {
      whereClause.event_time = {};
      if (startDate) {
        whereClause.event_time.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.event_time.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const events = await prisma.visitEvent.findMany({
      where: whereClause,
    });

    const stats: Record<string, number> = {
      DRAFT: 0,
      READY_BPJS: 0,
      BLOCKED_BPJS: 0,
      SENT_BPJS: 0,
      FAILED_BPJS: 0,
    };

    for (const event of events) {
      const progress = getTaskProgress(event.task_progress);
      const status = progress["1"]?.status || "DRAFT";
      if (status in stats) {
        stats[status]++;
      }
    }

    res.json({
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      stats,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/queue/pending
 * Lihat job yang masih PENDING di queue
 * Query params: limit, offset, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/queue/pending", async (req, res) => {
  try {
    const { limit = "20", offset = "0", startDate, endDate } = req.query;

    // Build where clause dengan date filter
    const whereClause: any = { status: "PENDING" };
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const jobs = await prisma.bpjsAntreanQueue.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      select: {
        id: true,
        visit_id: true,
        task_id: true,
        retry_count: true,
        last_error: true,
        event_time: true,
        createdAt: true,
      },
    });

    const total = await prisma.bpjsAntreanQueue.count({
      where: whereClause,
    });

    res.json(
      serializeBigInt({
        total,
        data: jobs,
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/queue/sent
 * Lihat job yang sudah berhasil dikirim (SEND)
 * Query params: limit, offset, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/queue/sent", async (req, res) => {
  try {
    const { limit = "50", offset = "0", startDate, endDate } = req.query;

    // Build where clause dengan date filter
    const whereClause: any = { status: "SEND" };
    if (startDate || endDate) {
      whereClause.sentAt = {};
      if (startDate) {
        whereClause.sentAt.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.sentAt.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const jobs = await prisma.bpjsAntreanQueue.findMany({
      where: whereClause,
      orderBy: { sentAt: "desc" },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      select: {
        id: true,
        visit_id: true,
        task_id: true,
        event_time: true,
        sentAt: true,
        createdAt: true,
      },
    });

    const total = await prisma.bpjsAntreanQueue.count({
      where: whereClause,
    });

    res.json(
      serializeBigInt({
        total,
        data: jobs,
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/queue/failed
 * Lihat job yang gagal setelah max retry (FAILED)
 * Query params: limit, offset, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/queue/failed", async (req, res) => {
  try {
    const { limit = "20", offset = "0", startDate, endDate } = req.query;

    // Build where clause dengan date filter
    const whereClause: any = { status: "FAILED" };
    if (startDate || endDate) {
      whereClause.updatedAt = {};
      if (startDate) {
        whereClause.updatedAt.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.updatedAt.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const jobs = await prisma.bpjsAntreanQueue.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      select: {
        id: true,
        visit_id: true,
        task_id: true,
        retry_count: true,
        last_error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const total = await prisma.bpjsAntreanQueue.count({
      where: whereClause,
    });

    res.json(
      serializeBigInt({
        total,
        data: jobs,
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/queue/:id/retry
 * Retry failed job
 */
router.post("/queue/:id/retry", async (req, res) => {
  try {
    const { id } = req.params;

    const job = await prisma.bpjsAntreanQueue.findUnique({
      where: { id: BigInt(id) },
    });

    if (!job) {
      return res.status(404).json({ error: "Queue job tidak ditemukan" });
    }

    if (job.status !== "FAILED") {
      return res.status(400).json({
        error: `Job status bukan FAILED (current: ${job.status})`,
      });
    }

    // Retry
    await retryFailedJob(BigInt(id));

    res.json({
      message: `Job ${id} di-retry`,
      visit_id: job.visit_id,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/queue/logs?queue_id=123
 * Lihat logs dari queue job
 * Query params: queue_id (required), limit, offset, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/queue/logs", async (req, res) => {
  try {
    const {
      queue_id,
      limit = "20",
      offset = "0",
      startDate,
      endDate,
    } = req.query;

    if (!queue_id) {
      return res.status(400).json({ error: "Parameter queue_id wajib diisi" });
    }

    // Build where clause dengan date filter
    const whereClause: any = { queue_id: BigInt(queue_id as string) };
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const logs = await prisma.bpjsAntreanLogs.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
    });

    res.json(
      serializeBigInt({
        queue_id,
        total: logs.length,
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        data: logs,
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/queue/stats
 * Statistik queue status
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/queue/stats", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build where clause dengan date filter
    const whereClause: any = {};
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(`${startDate}T00:00:00Z`);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const stats = await prisma.bpjsAntreanQueue.groupBy({
      by: ["status"],
      where: whereClause,
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

    // Hitung average retry count untuk failed jobs
    const failedJobsWhereClause: any = { status: "FAILED" };
    if (startDate || endDate) {
      failedJobsWhereClause.createdAt = {};
      if (startDate) {
        failedJobsWhereClause.createdAt.gte = new Date(
          `${startDate}T00:00:00Z`,
        );
      }
      if (endDate) {
        failedJobsWhereClause.createdAt.lte = new Date(`${endDate}T23:59:59Z`);
      }
    }

    const failedJobs = await prisma.bpjsAntreanQueue.aggregate({
      where: failedJobsWhereClause,
      _avg: {
        retry_count: true,
      },
    });

    res.json({
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      ...formatted,
      failed_avg_retry: failedJobs._avg.retry_count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
