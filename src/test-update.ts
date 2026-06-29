import { AppDataSource } from './infrastructure/database/data-source';
import { VehicleService } from './application/services/VehicleService';

async function test() {
    await AppDataSource.initialize();
    console.log('Connected to DB');
    const service = new VehicleService();

    // Buscar primer vehiculo
    const vehicles = await service.findByCompany('ca900073-29c9-4f34-8f76-816f9b61e3e1');
    if (vehicles.length === 0) {
        console.log('No vehicles found');
        process.exit(0);
    }
    const target = vehicles[0];
    console.log('Target vehicle:', target.id, target.plateNumber);

    try {
        console.log('Attempting update with extra fields...');
        const updated = await service.update(target.id, {
            plateNumber: target.plateNumber,
            capacity: target.capacity,
            companyId: 'ca900073-29c9-4f34-8f76-816f9b61e3e1' // esto viene del frontend
        } as any);
        console.log('Success! Updated vehicle:', updated.plateNumber);
    } catch (e) {
        console.error('Update failed:', e);
    }

    await AppDataSource.destroy();
    process.exit(0);
}

test().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
