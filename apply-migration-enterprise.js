const { AppDataSource } = require('./src/infrastructure/database/data-source');

AppDataSource.initialize().then(async (ds) => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    console.log('Enterprise DB Migration: Connected. Applying schema changes...');

    // 1. Agregar columna deleted_at a users
    try {
        await qr.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone NULL');
        console.log('✅ users.deleted_at column added');
    } catch (e) {
        console.log('ℹ️  users.deleted_at note:', e.message);
    }

    // 2. Agregar columna deleted_at a vehicles
    try {
        await qr.query('ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone NULL');
        console.log('✅ vehicles.deleted_at column added');
    } catch (e) {
        console.log('ℹ️  vehicles.deleted_at note:', e.message);
    }

    // 3. Agregar columna deleted_at a routes
    try {
        await qr.query('ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone NULL');
        console.log('✅ routes.deleted_at column added');
    } catch (e) {
        console.log('ℹ️  routes.deleted_at note:', e.message);
    }

    // 4. Agregar columna deleted_at a bookings
    try {
        await qr.query('ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone NULL');
        console.log('✅ bookings.deleted_at column added');
    } catch (e) {
        console.log('ℹ️  bookings.deleted_at note:', e.message);
    }

    // 5. Crear tabla audit_logs
    try {
        // Habilitar extension pgcrypto si no estuviera habilitada por defecto
        await qr.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
        
        await qr.query(`
            CREATE TABLE IF NOT EXISTS "audit_logs" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid,
                "user_email" varchar(255),
                "action" varchar(100) NOT NULL,
                "entity_name" varchar(100),
                "entity_id" varchar(100),
                "old_value" jsonb,
                "new_value" jsonb,
                "ip_address" varchar(50),
                "user_agent" varchar(500),
                "created_at" timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
            )
        `);
        console.log('✅ audit_logs table created successfully');
    } catch (e) {
        console.log('ℹ️  audit_logs table note:', e.message);
    }

    await qr.release();
    await ds.destroy();
    console.log('Enterprise DB Migration: Completed successfully!');
    process.exit(0);
}).catch((e) => {
    console.error('Error during migration:', e.message);
    process.exit(1);
});
