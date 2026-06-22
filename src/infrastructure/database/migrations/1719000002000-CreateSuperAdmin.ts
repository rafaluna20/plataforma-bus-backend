import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

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
export class CreateSuperAdmin1719000002000 implements MigrationInterface {
    name = 'CreateSuperAdmin1719000002000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Verificar si ya existe un SUPER_ADMIN para evitar duplicados
        const existing = await queryRunner.query(
            `SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`
        );

        if (existing.length > 0) {
            console.log('⚠️  Ya existe un SUPER_ADMIN. Saltando migración.');
            return;
        }

        const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@2026!';
        const passwordHash = await bcrypt.hash(password, 12);

        await queryRunner.query(`
            INSERT INTO users (
                id,
                name,
                email,
                password_hash,
                role,
                balance,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                'Super Administrador',
                'superadmin@transporte.pe',
                '${passwordHash}',
                'SUPER_ADMIN',
                0.00,
                true,
                NOW(),
                NOW()
            )
        `);

        console.log('✅ SUPER_ADMIN creado: superadmin@transporte.pe');
        console.log('⚠️  CAMBIAR LA CONTRASEÑA INMEDIATAMENTE EN PRODUCCIÓN');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM users WHERE email = 'superadmin@transporte.pe' AND role = 'SUPER_ADMIN'`
        );
        console.log('🗑️  SUPER_ADMIN eliminado');
    }
}
