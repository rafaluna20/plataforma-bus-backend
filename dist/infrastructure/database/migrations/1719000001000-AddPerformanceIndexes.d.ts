import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración: Agregar índices de rendimiento en tablas críticas
 * Optimiza las consultas más frecuentes:
 * - Búsqueda de viajes por fecha y estado
 * - Listado de viajes por empresa
 * - Búsqueda de reservas por viaje
 * - Búsqueda de vehículos por empresa
 *
 * Ejecutar: npm run typeorm migration:run
 */
export declare class AddPerformanceIndexes1719000001000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=1719000001000-AddPerformanceIndexes.d.ts.map