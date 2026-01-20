-- CreateTable
CREATE TABLE `Poli` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `poli_id` VARCHAR(20) NOT NULL,
    `nama` VARCHAR(100) NOT NULL,
    `kode_subspesialis` VARCHAR(20) NOT NULL,
    `nama_subspesialis` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Poli_poli_id_key`(`poli_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
