import express, { Router } from "express";
import type { Router as ExpressRouter } from "express";

const router: ExpressRouter = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

export default router;
