/*
  Warnings:

  - You are about to drop the column `event_type` on the `VisitEvent` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[visit_id]` on the table `VisitEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `VisitEvent_visit_id_event_type_key` ON `VisitEvent`;

-- AlterTable
ALTER TABLE `VisitEvent` DROP COLUMN `event_type`,
    ADD COLUMN `task_progress` JSON NULL;

-- CreateIndex
CREATE UNIQUE INDEX `VisitEvent_visit_id_key` ON `VisitEvent`(`visit_id`);
