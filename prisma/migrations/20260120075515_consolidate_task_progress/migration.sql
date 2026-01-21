/*
  Warnings:

  - You are about to drop the column `blocked_reason` on the `VisitEvent` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `VisitEvent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `VisitEvent` DROP COLUMN `blocked_reason`,
    DROP COLUMN `status`;
