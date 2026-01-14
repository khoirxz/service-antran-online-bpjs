import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "antrol",
  password: process.env.DB_PASSWORD || "antrol123",
  database: process.env.DB_NAME || "antrol_service",
});

const prisma = new PrismaClient({ adapter });

export default prisma;
