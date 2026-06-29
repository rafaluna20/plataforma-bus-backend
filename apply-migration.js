const { AppDataSource } = require('./src/infrastructure/database/data-source');

AppDataSource.initialize().then(async (ds) => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    console.log('DB connected. Applying schema changes...');

    // 1. Agregar valor al enum
    try {
        await qr.query("ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'AGENCY_SELLER'");
        console.log('✅ AGENCY_SELLER added to enum');
    } catch (e) {
        console.log('ℹ️  Enum note:', e.message);
    }

    // 2. Agregar columna station_id
    try {
        await qr.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "station_id" uuid NULL');
        console.log('✅ station_id column added');
    } catch (e) {
        console.log('ℹ️  Column note:', e.message);
    }

    // 3. Agregar FK (ignorar si ya existe)
    try {
        const tableExists = await qr.query(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'stations'"
        );
        if (tableExists.length > 0) {
            const fkExists = await qr.query(
                "SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_users_station_id' AND table_name = 'users'"
            );
            if (fkExists.length === 0) {
                await qr.query(
                    'ALTER TABLE "users" ADD CONSTRAINT "FK_users_station_id" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL'
                );
                console.log('✅ FK_users_station_id added');
            } else {
                console.log('ℹ️  FK already exists');
            }
        } else {
            console.log('ℹ️  stations table not found, skipping FK');
        }
    } catch (e) {
        console.log('ℹ️  FK note:', e.message);
    }

    await qr.release();
    await ds.destroy();
    console.log('Done!');
    process.exit(0);
}).catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
});
