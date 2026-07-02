import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Asignar un conductor (usuario con rol DRIVER) a un viaje.
 *
 * Agrega la columna "driver_id" (FK opcional) a la tabla "trips".
 * Es nullable a propósito: los viajes existentes no tienen conductor
 * y asignarlo es opcional al crear/editar el viaje.
 *
 * Necesaria porque en producción synchronize está desactivado
 * (NODE_ENV=production en el Dockerfile), por lo que el nuevo campo de
 * la entidad NO se crea automáticamente en la BD desplegada.
 */
export class AddDriverToTrips1719000004000 implements MigrationInterface {
    name = 'AddDriverToTrips1719000004000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Agregar columna driver_id como FK nullable a trips
        await queryRunner.query(`
            ALTER TABLE "trips"
            ADD COLUMN IF NOT EXISTS "driver_id" uuid NULL
        `);

        // 2. Agregar la FK a users(id) con ON DELETE SET NULL
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'FK_trips_driver_id'
                      AND table_name = 'trips'
                ) THEN
                    ALTER TABLE "trips"
                    ADD CONSTRAINT "FK_trips_driver_id"
                    FOREIGN KEY ("driver_id") REFERENCES "users"("id")
                    ON DELETE SET NULL;
                END IF;
            END;
            $$;
        `);

        // 3. Índice para acelerar "los viajes de este conductor"
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_trips_driver_id" ON "trips" ("driver_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_trips_driver_id"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "FK_trips_driver_id"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN IF EXISTS "driver_id"`);
    }
}
