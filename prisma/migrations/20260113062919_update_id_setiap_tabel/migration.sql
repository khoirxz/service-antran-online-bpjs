/*
  Warnings:

  - The primary key for the `BpjsAntreanLogs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `BpjsAntreanQueue` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `PollingState` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `VisitEvent` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE `BpjsAntreanLogs` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `BpjsAntreanQueue` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `PollingState` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `VisitEvent` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);
