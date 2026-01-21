-- CreateTable
CREATE TABLE `TaskValidationLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `visit_id` VARCHAR(50) NOT NULL,
    `expected_task_id` INTEGER NULL,
    `actual_task_id` INTEGER NULL,
    `missing_task_id` INTEGER NULL,
    `error_reason` VARCHAR(100) NOT NULL,
    `status` ENUM('PENDING', 'RESOLVED', 'IGNORED') NOT NULL DEFAULT 'PENDING',
    `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    INDEX `TaskValidationLog_visit_id_idx`(`visit_id`),
    INDEX `TaskValidationLog_status_idx`(`status`),
    INDEX `TaskValidationLog_detected_at_idx`(`detected_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
