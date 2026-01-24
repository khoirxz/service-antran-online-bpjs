import { Router } from "express";
import type { Request, Response } from "express";
import {
  getPendingValidationIssues,
  resolveValidationIssue,
  ignoreValidationIssue,
} from "../domain/task.validator";
import prisma from "../lib/prisma";
import { serializeBigInt } from "../utils/bigInt";
import { fetchTaskId } from "../khanza/khanza.query";
import { updateTaskProgress } from "../domain/task.progress";
import { createUtcDateTimeFromLocal } from "../utils/formatDate";

// Config
const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,
  DEFAULT_VALIDATION_HISTORY_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

const router: Router = Router();

// Utility functions
const validateBigInt = (
  value: string | string[] | undefined,
): bigint | null => {
  if (!value || Array.isArray(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const ensureString = (value: string | string[] | undefined): string | null => {
  if (!value || Array.isArray(value)) return null;
  return value.trim() === "" ? null : value;
};

const validatePaginationParams = (
  page?: string | string[],
  pageSize?: string | string[],
  defaultSize: number = PAGINATION_CONFIG.DEFAULT_PAGE_SIZE,
) => {
  const pageStr = Array.isArray(page) ? page[0] : page;
  const pageSizeStr = Array.isArray(pageSize) ? pageSize[0] : pageSize;

  const parsedPage = Math.max(1, parseInt(pageStr || "1", 10) || 1);
  const parsedPageSize = Math.min(
    PAGINATION_CONFIG.MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(pageSizeStr || String(defaultSize), 10) || defaultSize,
    ),
  );

  return {
    page: parsedPageSize <= 0 ? 1 : parsedPage,
    pageSize: parsedPageSize,
    skip: (parsedPage - 1) * parsedPageSize,
  };
};

/**
 * GET /admin/tasks/invalid
 * Get all pending task validation issues grouped by visit
 * Query params: page (default: 1), pageSize (default: 10, max: 100)
 */
router.get("/tasks/invalid", async (req: Request, res: Response) => {
  try {
    const { page, pageSize, skip } = validatePaginationParams(
      req.query.page as string,
      req.query.pageSize as string,
      PAGINATION_CONFIG.DEFAULT_PAGE_SIZE,
    );

    const issues = await getPendingValidationIssues();
    const totalVisitsWithIssues = issues.length;
    const totalIssues = issues.reduce((sum, v) => sum + v.issueCount, 0);

    // Paginate the results
    const paginatedIssues = issues.slice(skip, skip + pageSize);

    return res.json(
      serializeBigInt({
        success: true,
        pagination: {
          page,
          pageSize,
          totalPages: Math.ceil(totalVisitsWithIssues / pageSize),
          totalVisitsWithIssues,
          totalIssues,
        },
        data: paginatedIssues.map((group) => ({
          visit_id: group.visit_id,
          issueCount: group.issueCount,
          firstDetected: group.firstDetected,
          lastDetected: group.lastDetected,
          issues: group.issues.map((issue) => ({
            id: issue.id,
            errorReason: issue.error_reason,
            actualTask: issue.actual_task_id,
            expectedTask: issue.expected_task_id,
            missingTask: issue.missing_task_id,
            detectedAt: issue.detected_at,
            createdBy: issue.created_by,
            notes: issue.notes,
          })),
        })),
      }),
    );
  } catch (error) {
    console.error("Failed to fetch validation issues:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch validation issues",
      error: (error as Error).message,
    });
  }
});

/**
 * GET /admin/tasks/invalid/stats
 * Get statistics of validation issues
 */
router.get("/tasks/invalid/stats", async (req, res) => {
  try {
    const [pendingCount, resolvedCount, ignoredCount] = await Promise.all([
      prisma.taskValidationLog.count({ where: { status: "PENDING" } }),
      prisma.taskValidationLog.count({ where: { status: "RESOLVED" } }),
      prisma.taskValidationLog.count({ where: { status: "IGNORED" } }),
    ]);

    // Get most common error reasons
    const errorReasons = await prisma.taskValidationLog.groupBy({
      by: ["error_reason"],
      where: { status: "PENDING" },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
    });

    return res.json(
      serializeBigInt({
        success: true,
        stats: {
          pending: pendingCount,
          resolved: resolvedCount,
          ignored: ignoredCount,
          total: pendingCount + resolvedCount + ignoredCount,
        },
        commonErrors: errorReasons.map((er) => ({
          reason: er.error_reason,
          count: er._count.id,
        })),
      }),
    );
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stats",
      error: (error as Error).message,
    });
  }
});

/**
 * POST /admin/tasks/invalid/:id/resolve
 * Mark validation issue as resolved
 */
router.post(
  "/tasks/invalid/:id/resolve",
  async (req: Request, res: Response) => {
    try {
      const id = ensureString(req.params.id);
      const { notes } = req.body;

      // Validate ID
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      const bigIntId = validateBigInt(id);
      if (!bigIntId) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      const resolved = await resolveValidationIssue(bigIntId, notes);

      return res.json(
        serializeBigInt({
          success: true,
          message: "Validation issue marked as resolved",
          data: resolved,
        }),
      );
    } catch (error) {
      console.error("Failed to resolve validation issue:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to resolve validation issue",
        error: (error as Error).message,
      });
    }
  },
);

/**
 * POST /admin/tasks/invalid/:id/ignore
 * Mark validation issue as ignored
 */
router.post(
  "/tasks/invalid/:id/ignore",
  async (req: Request, res: Response) => {
    try {
      const id = ensureString(req.params.id);
      const { notes } = req.body;

      // Validate ID
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      const bigIntId = validateBigInt(id);
      if (!bigIntId) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      const ignored = await ignoreValidationIssue(bigIntId, notes);

      return res.json(
        serializeBigInt({
          success: true,
          message: "Validation issue marked as ignored",
          data: ignored,
        }),
      );
    } catch (error) {
      console.error("Failed to ignore validation issue:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to ignore validation issue",
        error: (error as Error).message,
      });
    }
  },
);

/**
 * GET /admin/visits/:visitId/validation-history
 * Get validation history for a specific visit with pagination
 * Query params: page (default: 1), pageSize (default: 20, max: 100)
 */
router.get(
  "/visits/:visitId/validation-history",
  async (req: Request, res: Response) => {
    try {
      const visitId = ensureString(req.params.visitId);

      // Validate visitId
      if (!visitId) {
        return res.status(400).json({
          success: false,
          message: "Invalid visitId",
        });
      }

      const { page, pageSize, skip } = validatePaginationParams(
        req.query.page as string | string[],
        req.query.pageSize as string | string[],
        PAGINATION_CONFIG.DEFAULT_VALIDATION_HISTORY_SIZE,
      );

      const [history, totalCount] = await Promise.all([
        prisma.taskValidationLog.findMany({
          where: {
            visit_id: visitId,
          },
          orderBy: {
            detected_at: "desc",
          },
          skip,
          take: pageSize,
        }),
        prisma.taskValidationLog.count({
          where: {
            visit_id: visitId,
          },
        }),
      ]);

      return res.json(
        serializeBigInt({
          success: true,
          visitId,
          pagination: {
            page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize),
            totalLogs: totalCount,
          },
          data: history,
        }),
      );
    } catch (error) {
      console.error("Failed to fetch validation history:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch validation history",
        error: (error as Error).message,
      });
    }
  },
);

/**
 * POST /admin/events/:visitId/revalidate
 * Revalidate dan resync task dari Khanza untuk visit tertentu
 * - Fetch ulang task_id dari Khanza
 * - Update task_progress di VisitEvent
 * - Hapus queue FAILED/PENDING untuk rebuild
 */
router.post(
  "/events/:visitId/revalidate",
  async (req: Request, res: Response) => {
    try {
      const visitId = ensureString(req.params.visitId);

      if (!visitId) {
        return res.status(400).json({
          success: false,
          message: "visitId wajib diisi",
        });
      }

      // Cari VisitEvent
      const visitEvent = await prisma.visitEvent.findUnique({
        where: { visit_id: visitId },
      });

      if (!visitEvent) {
        return res.status(404).json({
          success: false,
          message: `VisitEvent ${visitId} tidak ditemukan`,
        });
      }

      const results: {
        task: number;
        action: string;
        eventTime?: string;
      }[] = [];

      // Fetch task 3-7 dari Khanza untuk visit ini
      const taskIds = [3, 4, 5, 6, 7] as const;

      for (const taskId of taskIds) {
        try {
          // Query Khanza untuk task ini - menggunakan cursor sangat awal
          const rows = await fetchTaskId(taskId, "2000-01-01 00:00:00");

          // Cari row yang match dengan visitId
          const matchedRow = rows.find((r) => r.no_rawat === visitId);

          if (matchedRow && matchedRow.event_time) {
            // Parse event time - bisa Date object atau string
            const eventTimeRaw = matchedRow.event_time as unknown;
            const eventTimeStr =
              eventTimeRaw instanceof Date
                ? eventTimeRaw.toISOString()
                : String(matchedRow.event_time);

            const dateStr = eventTimeStr.slice(0, 10);
            const timeStr = eventTimeStr.slice(11, 19);
            const eventTime = createUtcDateTimeFromLocal(dateStr, timeStr);

            // Update task_progress
            const newProgress = updateTaskProgress(
              visitEvent.task_progress,
              taskId,
              "DRAFT",
              undefined,
              eventTime.toISOString(),
            );

            await prisma.visitEvent.update({
              where: { visit_id: visitId },
              data: { task_progress: newProgress as any },
            });

            // Hapus queue lama untuk task ini (jika ada)
            await prisma.bpjsAntreanQueue.deleteMany({
              where: {
                visit_id: visitId,
                task_id: taskId,
                status: { in: ["PENDING", "FAILED"] },
              },
            });

            results.push({
              task: taskId,
              action: "UPDATED",
              eventTime: eventTime.toISOString(),
            });
          } else {
            results.push({
              task: taskId,
              action: "NOT_FOUND_IN_KHANZA",
            });
          }
        } catch (error: any) {
          results.push({
            task: taskId,
            action: `ERROR: ${error.message}`,
          });
        }
      }

      // Clear validation logs untuk visit ini
      await prisma.taskValidationLog.updateMany({
        where: {
          visit_id: visitId,
          status: "PENDING",
        },
        data: {
          status: "RESOLVED",
          resolved_at: new Date(),
          notes: "Auto-resolved via revalidate API",
        },
      });

      // Ambil data terbaru
      const updatedEvent = await prisma.visitEvent.findUnique({
        where: { visit_id: visitId },
      });

      return res.json(
        serializeBigInt({
          success: true,
          message: "Revalidation completed",
          visitId,
          results,
          task_progress: updatedEvent?.task_progress,
        }),
      );
    } catch (error) {
      console.error("Failed to revalidate:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to revalidate",
        error: (error as Error).message,
      });
    }
  },
);

/**
 * POST /admin/events/:visitId/rebuild-queue
 * Rebuild queue untuk visit tertentu (task yang DRAFT akan di-queue ulang)
 */
router.post(
  "/events/:visitId/rebuild-queue",
  async (req: Request, res: Response) => {
    try {
      const visitId = ensureString(req.params.visitId);

      if (!visitId) {
        return res.status(400).json({
          success: false,
          message: "visitId wajib diisi",
        });
      }

      // Hapus queue PENDING/FAILED untuk visit ini
      const deleted = await prisma.bpjsAntreanQueue.deleteMany({
        where: {
          visit_id: visitId,
          status: { in: ["PENDING", "FAILED"] },
        },
      });

      // Queue builder akan otomatis rebuild pada cycle berikutnya
      return res.json({
        success: true,
        message: `Deleted ${deleted.count} queue items. Queue akan di-rebuild pada cycle berikutnya.`,
        visitId,
        deletedCount: deleted.count,
      });
    } catch (error) {
      console.error("Failed to rebuild queue:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to rebuild queue",
        error: (error as Error).message,
      });
    }
  },
);

export default router;
