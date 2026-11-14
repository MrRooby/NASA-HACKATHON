-- Grants for the wearable and medical ETL modules.
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_wearables.* TO 'astro_etl'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_medical.* TO 'astro_etl'@'%';
GRANT ALL PRIVILEGES ON astro_wearables.* TO 'admin'@'%';
GRANT ALL PRIVILEGES ON astro_medical.* TO 'admin'@'%';
FLUSH PRIVILEGES;
