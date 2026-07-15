import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDispatchingTripStatus1784073725830 implements MigrationInterface {
    name = 'AddDispatchingTripStatus1784073725830'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."trips_status_enum" ADD VALUE 'DISPATCHING'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."trips_status_enum_old" AS ENUM('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" TYPE "public"."trips_status_enum_old" USING "status"::"text"::"public"."trips_status_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."trips_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."trips_status_enum_old" RENAME TO "trips_status_enum"`);
    }

}
