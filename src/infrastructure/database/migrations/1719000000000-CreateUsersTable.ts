import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Migración: Crear tabla de usuarios con roles y billetera
 * Ejecutar: npm run typeorm migration:run
 */
export class CreateUsersTable1719000000000 implements MigrationInterface {
    name = 'CreateUsersTable1719000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Crear el tipo ENUM para roles
        await queryRunner.query(`
            CREATE TYPE "user_role_enum" AS ENUM (
                'SUPER_ADMIN',
                'ADMIN',
                'DRIVER',
                'PASSENGER'
            )
        `);

        // 2. Crear la tabla users
        await queryRunner.createTable(
            new Table({
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'name',
                        type: 'varchar',
                        length: '150',
                        isNullable: false,
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '200',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'password_hash',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'role',
                        type: 'user_role_enum',
                        default: "'PASSENGER'",
                        isNullable: false,
                    },
                    {
                        name: 'doc_type',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'doc_num',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'phone',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'balance',
                        type: 'decimal',
                        precision: 10,
                        scale: 2,
                        default: '0.00',
                        isNullable: false,
                    },
                    {
                        name: 'company_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'is_active',
                        type: 'boolean',
                        default: true,
                        isNullable: false,
                    },
                    {
                        name: 'refresh_token',
                        type: 'varchar',
                        length: '500',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp with time zone',
                        default: 'CURRENT_TIMESTAMP',
                        isNullable: false,
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp with time zone',
                        default: 'CURRENT_TIMESTAMP',
                        isNullable: false,
                    },
                ],
            }),
            true // ifNotExists
        );

        // 3. Índice en email (búsquedas de login)
        await queryRunner.createIndex(
            'users',
            new TableIndex({
                name: 'IDX_users_email',
                columnNames: ['email'],
                isUnique: true,
            })
        );

        // 4. Índice en role (filtros por rol)
        await queryRunner.createIndex(
            'users',
            new TableIndex({
                name: 'IDX_users_role',
                columnNames: ['role'],
            })
        );

        // 5. Índice en company_id (listar usuarios de una empresa)
        await queryRunner.createIndex(
            'users',
            new TableIndex({
                name: 'IDX_users_company_id',
                columnNames: ['company_id'],
            })
        );

        // 6. Foreign Key a companies
        await queryRunner.createForeignKey(
            'users',
            new TableForeignKey({
                name: 'FK_users_company',
                columnNames: ['company_id'],
                referencedTableName: 'companies',
                referencedColumnNames: ['id'],
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE',
            })
        );

        // 7. Trigger para actualizar updated_at automáticamente
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await queryRunner.query(`
            CREATE TRIGGER update_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revertir en orden inverso
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_users_updated_at ON users`);
        await queryRunner.dropForeignKey('users', 'FK_users_company');
        await queryRunner.dropIndex('users', 'IDX_users_company_id');
        await queryRunner.dropIndex('users', 'IDX_users_role');
        await queryRunner.dropIndex('users', 'IDX_users_email');
        await queryRunner.dropTable('users');
        await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
    }
}
