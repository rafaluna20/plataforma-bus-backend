import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: tarifas dinámicas por ruta (franja horaria y fechas
 * especiales/feriados). Ver FareRuleEntity para el detalle de cada campo.
 */
export class CreateFareRules1719000010000 implements MigrationInterface {
    name = 'CreateFareRules1719000010000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "fare_rules_rule_type_enum" AS ENUM ('TIME_BAND', 'SPECIFIC_DATE')
        `);

        await queryRunner.query(`
            CREATE TABLE "fare_rules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "route_id" uuid NOT NULL,
                "name" varchar(100) NOT NULL,
                "rule_type" "fare_rules_rule_type_enum" NOT NULL,
                "start_time" varchar(5) NULL,
                "end_time" varchar(5) NULL,
                "days_of_week" text NULL,
                "start_date" date NULL,
                "end_date" date NULL,
                "price_multiplier" decimal(6,4) NOT NULL,
                "priority" int NOT NULL DEFAULT 0,
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT "PK_fare_rules" PRIMARY KEY ("id"),
                CONSTRAINT "FK_fare_rules_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_fare_rules_route" ON "fare_rules" ("route_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "fare_rules"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "fare_rules_rule_type_enum"`);
    }
}
