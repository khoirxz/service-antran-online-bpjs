/*
  Warnings:

  - Added the required column `nama_dokter` to the `DoctorScheduleQuota` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nama_poli` to the `DoctorScheduleQuota` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `DoctorScheduleQuota` ADD COLUMN `nama_dokter` VARCHAR(100) NOT NULL,
    ADD COLUMN `nama_poli` VARCHAR(100) NOT NULL;
