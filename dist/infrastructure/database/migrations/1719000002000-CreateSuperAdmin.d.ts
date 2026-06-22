import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración: Crear el primer usuario SUPER_ADMIN del sistema.
 *
 * ⚠️ IMPORTANTE: Cambiar la contraseña inmediatamente después de ejecutar esta migración.
 * Ejecutar: npm run typeorm migration:run
 *
 * Credenciales iniciales:
 *   Email:    superadmin@transporte.pe
 *   Password: Admin@2026! (CAMBIAR EN PRODUCCIÓN)
 */
export declare class CreateSuperAdmin1719000002000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=1719000002000-CreateSuperAdmin.d.ts.map