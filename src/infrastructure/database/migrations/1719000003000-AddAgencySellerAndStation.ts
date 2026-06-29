import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Agregar rol AGENCY_SELLER y campo station_id a usuarios
 *
 * Esta migración:
 * 1. Extiende el enum "user_role_enum" con el valor 'AGENCY_SELLER'
 * 2. Agrega la columna "station_id" (FK opcional) a la tabla "users"
 */
export class AddAgencySellerAndStation1719000003000 implements MigrationInterface {
    name = 'AddAgencySellerAndStation1719000003000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Agregar AGENCY_SELLER al enum de roles de PostgreSQL
        await queryRunner.query(`
            ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'AGENCY_SELLER'
        `);

        // 2. Agregar columna station_id como FK nullable a users
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "station_id" uuid NULL
        `);

        // 3. Agregar la FK si la tabla stations existe
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stations') THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints
                        WHERE constraint_name = 'FK_users_station_id'
                          AND table_name = 'users'
                    ) THEN
                        ALTER TABLE "users"
                        ADD CONSTRAINT "FK_users_station_id"
                        FOREIGN KEY ("station_id") REFERENCES "stations"("id")
                        ON DELETE SET NULL;
                    END IF;
                END IF;
            END;
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar FK y columna
        await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_station_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "station_id"
        `);
        // Nota: PostgreSQL no permite eliminar valores de un enum fácilmente.
        // Para revertir el enum habría que recrearlo, lo cual es complejo.
        // Documentamos el issue pero no lo revertimos automáticamente.
    }
}
