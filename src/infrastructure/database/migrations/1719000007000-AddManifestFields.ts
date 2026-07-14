import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: campos necesarios para reproducir el Manifiesto de Pasajeros
 * en el formato exigido por SUNAT/MTC para transporte interprovincial.
 *
 * - companies: sedes (JSON), domicilio fiscal, N° autorización SUNAT de
 *   impresión, numeración correlativa de manifiestos y boletos.
 * - vehicles: marca, Tarjeta Única de Circulación, N° de póliza de seguro.
 * - trips: copiloto (nombre + licencia), auxiliar, N° de manifiesto (se
 *   congela la primera vez que se imprime).
 * - users: N° de licencia de conducir (relevante para role=DRIVER).
 * - bookings: edad y celular del pasajero, N° de boleto correlativo,
 *   observaciones libres.
 */
export class AddManifestFields1719000007000 implements MigrationInterface {
    name = 'AddManifestFields1719000007000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "companies"
            ADD COLUMN IF NOT EXISTS "office_branches" jsonb NULL,
            ADD COLUMN IF NOT EXISTS "fiscal_address" text NULL,
            ADD COLUMN IF NOT EXISTS "sunat_print_authorization" varchar(30) NULL,
            ADD COLUMN IF NOT EXISTS "manifest_series" varchar(10) NULL DEFAULT '001',
            ADD COLUMN IF NOT EXISTS "manifest_next_number" int NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS "ticket_next_number" int NOT NULL DEFAULT 1
        `);

        await queryRunner.query(`
            ALTER TABLE "vehicles"
            ADD COLUMN IF NOT EXISTS "brand" varchar(60) NULL,
            ADD COLUMN IF NOT EXISTS "circulation_card" varchar(30) NULL,
            ADD COLUMN IF NOT EXISTS "insurance_policy" varchar(30) NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "trips"
            ADD COLUMN IF NOT EXISTS "copilot_name" varchar(150) NULL,
            ADD COLUMN IF NOT EXISTS "copilot_license" varchar(30) NULL,
            ADD COLUMN IF NOT EXISTS "auxiliar_name" varchar(150) NULL,
            ADD COLUMN IF NOT EXISTS "manifest_number" varchar(20) NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "license_number" varchar(30) NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "bookings"
            ADD COLUMN IF NOT EXISTS "passenger_age" int NULL,
            ADD COLUMN IF NOT EXISTS "passenger_phone" varchar(20) NULL,
            ADD COLUMN IF NOT EXISTS "ticket_number" varchar(20) NULL,
            ADD COLUMN IF NOT EXISTS "observations" varchar(200) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "bookings"
            DROP COLUMN IF EXISTS "passenger_age",
            DROP COLUMN IF EXISTS "passenger_phone",
            DROP COLUMN IF EXISTS "ticket_number",
            DROP COLUMN IF EXISTS "observations"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "license_number"
        `);
        await queryRunner.query(`
            ALTER TABLE "trips"
            DROP COLUMN IF EXISTS "copilot_name",
            DROP COLUMN IF EXISTS "copilot_license",
            DROP COLUMN IF EXISTS "auxiliar_name",
            DROP COLUMN IF EXISTS "manifest_number"
        `);
        await queryRunner.query(`
            ALTER TABLE "vehicles"
            DROP COLUMN IF EXISTS "brand",
            DROP COLUMN IF EXISTS "circulation_card",
            DROP COLUMN IF EXISTS "insurance_policy"
        `);
        await queryRunner.query(`
            ALTER TABLE "companies"
            DROP COLUMN IF EXISTS "office_branches",
            DROP COLUMN IF EXISTS "fiscal_address",
            DROP COLUMN IF EXISTS "sunat_print_authorization",
            DROP COLUMN IF EXISTS "manifest_series",
            DROP COLUMN IF EXISTS "manifest_next_number",
            DROP COLUMN IF EXISTS "ticket_next_number"
        `);
    }
}
