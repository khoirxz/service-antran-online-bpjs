import { Router } from "express";
import {
  getPendingValidationIssues,
  resolveValidationIssue,
  ignoreValidationIssue,
} from "../domain/task.validator";
import prisma from "../lib/prisma";
import { serializeBigInt } from "../utils/bigInt";

const router: Router = Router();

/**
 * GET /admin/tasks/invalid
 * Get all pending task validation issues grouped by visit
 */
router.get("/tasks/invalid", async (req, res) => {
  try {
    const issues = await getPendingValidationIssues();

    return res.json(
      serializeBigInt({
        success: true,
        totalVisitsWithIssues: issues.length,
        totalIssues: issues.reduce((sum, v) => sum + v.issueCount, 0),
        data: issues.map((group) => ({
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
router.post("/tasks/invalid/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const resolved = await resolveValidationIssue(BigInt(id), notes);

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
});

/**
 * POST /admin/tasks/invalid/:id/ignore
 * Mark validation issue as ignored
 */
router.post("/tasks/invalid/:id/ignore", async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const ignored = await ignoreValidationIssue(BigInt(id), notes);

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
});

/**
 * GET /admin/visits/:visitId/validation-history
 * Get validation history for a specific visit
 */
router.get("/visits/:visitId/validation-history", async (req, res) => {
  try {
    const { visitId } = req.params;

    const history = await prisma.taskValidationLog.findMany({
      where: {
        visit_id: visitId,
      },
      orderBy: {
        detected_at: "desc",
      },
    });

    return res.json(
      serializeBigInt({
        success: true,
        visitId,
        totalLogs: history.length,
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
});

export default router;
