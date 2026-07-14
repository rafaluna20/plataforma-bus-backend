import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: agregar el estado RESERVED al enum de payment_status de bookings.
 *
 * Representa un asiento apartado (nombre + documento del pasajero, sin cobro
 * todavía) — distinto de PENDING_CASH/PENDING_DIGITAL, que ya implican una
 * venta en curso. Se confirma después hacia PENDING_CASH o PAID_DIGITAL.
 */
export class AddReservedPaymentStatus1719000006000 implements MigrationInterface {
    name = 'AddReservedPaymentStatus1719000006000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "bookings_payment_status_enum" ADD VALUE IF NOT EXISTS 'RESERVED'
        `);
    }

    public async down(): Promise<void> {
        // Nota: PostgreSQL no permite eliminar valores de un enum fácilmente.
        // Para revertir habría que recrear el tipo, lo cual es complejo.
        // Documentamos el issue pero no lo revertimos automáticamente.
    }
}
