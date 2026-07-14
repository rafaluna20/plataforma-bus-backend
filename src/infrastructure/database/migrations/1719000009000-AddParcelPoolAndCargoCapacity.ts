import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: "bandeja de encomiendas" (encomiendas sin viaje asignado) +
 * capacidad de carga por vehículo.
 *
 * - parcels.trip_id pasa a ser opcional: una encomienda puede registrarse sin
 *   viaje ("pendiente de asignar") y asignarse/reasignarse después.
 * - parcels_status_enum gana el valor CANCELLED, que no existía.
 * - vehicles.max_cargo_weight_kg (opcional): límite de peso de carga, para
 *   poder advertir cuando un viaje se acerca al límite en vez de que sea
 *   puro criterio del personal.
 */
export class AddParcelPoolAndCargoCapacity1719000009000 implements MigrationInterface {
    name = 'AddParcelPoolAndCargoCapacity1719000009000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "parcels" ALTER COLUMN "trip_id" DROP NOT NULL
        `);

        await queryRunner.query(`
            ALTER TYPE "parcels_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED'
        `);

        await queryRunner.query(`
            ALTER TABLE "vehicles"
            ADD COLUMN IF NOT EXISTS "max_cargo_weight_kg" decimal(7,2) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "max_cargo_weight_kg"
        `);
        // No se revierte trip_id NOT NULL ni el valor del enum: requeriría
        // primero reasignar/eliminar cualquier encomienda sin viaje, y
        // Postgres no soporta quitar un valor de enum de forma sencilla.
    }
}
