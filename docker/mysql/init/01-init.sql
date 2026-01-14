-- Init script untuk MySQL
-- File ini akan dijalankan otomatis saat container pertama kali dibuat

-- Set character set
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Grant full privileges untuk user antrol (termasuk CREATE DATABASE untuk Prisma shadow db)
GRANT ALL PRIVILEGES ON *.* TO 'antrol'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
