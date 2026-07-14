import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: galería de fotos del vehículo (para el slider del panel de
 * asientos), además de la foto de portada existente (image_url).
 */
export class AddVehicleImageUrls1719000008000 implements MigrationInterface {
    name = 'AddVehicleImageUrls1719000008000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "vehicles"
            ADD COLUMN IF NOT EXISTS "image_urls" text NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "image_urls"
        `);
    }
}
