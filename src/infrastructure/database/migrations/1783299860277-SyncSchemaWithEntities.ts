import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncSchemaWithEntities1783299860277 implements MigrationInterface {
    name = 'SyncSchemaWithEntities1783299860277'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parcels" DROP CONSTRAINT "parcels_seller_id_fkey"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_parcels_seller_id"`);
        await queryRunner.query(`ALTER TABLE "parcels" ADD CONSTRAINT "FK_0adf035e7e07559b547b5c31fda" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parcels" DROP CONSTRAINT "FK_0adf035e7e07559b547b5c31fda"`);
        await queryRunner.query(`CREATE INDEX "IDX_parcels_seller_id" ON "parcels" USING btree ("seller_id") `);
        await queryRunner.query(`ALTER TABLE "parcels" ADD CONSTRAINT "parcels_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
