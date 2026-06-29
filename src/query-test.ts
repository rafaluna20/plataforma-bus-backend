import { AppDataSource } from './infrastructure/database/data-source';

async function test() {
    await AppDataSource.initialize();
    console.log('Connected to DB');
    const qr = AppDataSource.createQueryRunner();
    await qr.connect();

    console.log('--- Vehicles ---');
    const vehicles = await qr.query('SELECT * FROM vehicles LIMIT 5');
    console.log(vehicles);

    console.log('--- Routes ---');
    const routes = await qr.query('SELECT * FROM routes LIMIT 5');
    console.log(routes);

    console.log('--- Route Waypoints ---');
    const waypoints = await qr.query('SELECT * FROM route_waypoints LIMIT 5');
    console.log(waypoints);

    console.log('--- Bookings ---');
    const bookings = await qr.query('SELECT * FROM bookings LIMIT 5');
    console.log(bookings);

    await qr.release();
    await AppDataSource.destroy();
    console.log('Done');
    process.exit(0);
}

test().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
