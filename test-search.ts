import { AppDataSource } from './src/infrastructure/database/data-source';
import { TripEntity, TripStatus } from './src/infrastructure/database/entities/TripEntity';
import { Between } from 'typeorm';

async function test() {
    await AppDataSource.initialize();
    
    const travelDate = new Date('2026-06-21T00:00:00Z');
    const startOfDay = new Date(travelDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(travelDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log('startOfDay:', startOfDay.toISOString());
    console.log('endOfDay:', endOfDay.toISOString());

    const tripRepository = AppDataSource.getRepository(TripEntity);
    const tripsOnDate = await tripRepository.find({
        where: {
            departureTime: Between(startOfDay, endOfDay),
            status: TripStatus.SCHEDULED
        },
        relations: { route: { company: true }, vehicle: true }
    });

    console.log('tripsOnDate length:', tripsOnDate.length);
    if (tripsOnDate.length > 0) {
        console.log('Found Trip:', tripsOnDate[0].id, tripsOnDate[0].departureTime);
    } else {
        const allTrips = await tripRepository.find();
        console.log('All trips in DB:', allTrips.map(t => ({ id: t.id, time: t.departureTime })));
    }

    await AppDataSource.destroy();
}

test().catch(console.error);
