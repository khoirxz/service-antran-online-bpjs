import "dotenv/config";
import express, { Application, Request, Response } from "express";
import prisma from "./lib/prisma";
import healthRoutes from "./api/health.routes";
import quotaRoutes from "./api/quota.routes";
import auditRoutes from "./api/audit.routes";

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Welcome to Antrol Service API!!" });
});

// Routes
app.use("/health", healthRoutes);
app.use("/admin", quotaRoutes);
app.use("/admin", auditRoutes);

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

export { app, prisma };
