import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add seller_id column to parcels table
 * Tracks which vendor (ADMIN / AGENCY_SELLER) registered each parcel.
 * Column is nullable so existing rows are not affected.
 */
export class AddSellerToParcels1719000005000 implements MigrationInterface {
    name = 'AddSellerToParcels1719000005000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add seller_id FK to users table (nullable — existing rows get NULL)
        await queryRunner.query(`
            ALTER TABLE "parcels"
            ADD COLUMN IF NOT EXISTS "seller_id" uuid NULL
            REFERENCES "users"("id") ON DELETE SET NULL
        `);

        // Index for fast seller-based queries
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_parcels_seller_id"
            ON "parcels" ("seller_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_parcels_seller_id"`);
        await queryRunner.query(`ALTER TABLE "parcels" DROP COLUMN IF EXISTS "seller_id"`);
    }
}
