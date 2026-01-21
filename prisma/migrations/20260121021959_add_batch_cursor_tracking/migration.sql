-- AlterTable
ALTER TABLE `PollingState` ADD COLUMN `batch_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pending_cursor` VARCHAR(100) NULL;
