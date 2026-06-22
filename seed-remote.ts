import 'dotenv/config';
import { AppDataSource } from './src/infrastructure/database/data-source';
import { CompanyEntity } from './src/infrastructure/database/entities/CompanyEntity';
import { VehicleEntity, VehicleType, ServiceMode } from './src/infrastructure/database/entities/VehicleEntity';
import { RouteEntity } from './src/infrastructure/database/entities/RouteEntity';
import { RouteWaypointEntity } from './src/infrastructure/database/entities/RouteWaypointEntity';
import { TripEntity, TripStatus } from './src/infrastructure/database/entities/TripEntity';

async function seed() {
    console.log('⏳ Conectando a la base de datos externa en EasyPanel...');
    await AppDataSource.initialize();
    console.log('✅ Conectado a la BD.');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        console.log('🧹 Limpiando base de datos (Opcional, pero útil para probar desde cero)...');
        await queryRunner.query(`TRUNCATE TABLE "bookings" CASCADE;`);
        await queryRunner.query(`TRUNCATE TABLE "trips" CASCADE;`);
        await queryRunner.query(`TRUNCATE TABLE "route_waypoints" CASCADE;`);
        await queryRunner.query(`TRUNCATE TABLE "routes" CASCADE;`);
        await queryRunner.query(`TRUNCATE TABLE "vehicles" CASCADE;`);
        await queryRunner.query(`TRUNCATE TABLE "companies" CASCADE;`);

        console.log('🌱 1. Creando Empresa...');
        const companyRepo = queryRunner.manager.getRepository(CompanyEntity);
        const company = companyRepo.create({
            tradeName: 'Transportes Flash',
            legalName: 'Transportes Flash S.A.C.',
            ruc: '20123456789'
        });
        await companyRepo.save(company);

        console.log('🚐 2. Creando Vehículo (Minivan VIP 12 Asientos)...');
        const vehicleRepo = queryRunner.manager.getRepository(VehicleEntity);
        const vehicle = vehicleRepo.create({
            plateNumber: 'ABC-123',
            capacity: 12,
            vehicleType: VehicleType.MINIVAN,
            serviceMode: ServiceMode.INTERPROVINCIAL,
            seatTemplate: Array.from({ length: 12 }, (_, i) => ({ id: `S${i+1}` })),
            company: company
        });
        await vehicleRepo.save(vehicle);

        console.log('📍 3. Creando Estaciones y Ruta (Lima - Huancayo)...');
        const stationRepo = queryRunner.manager.getRepository('StationEntity');
        
        const station1 = stationRepo.create({ name: 'Terminal Yerbateros', city: 'Lima', location: { type: 'Point', coordinates: [-76.995, -12.066] } as any, company });
        const station2 = stationRepo.create({ name: 'Paradero Chosica', city: 'Chosica', location: { type: 'Point', coordinates: [-76.697, -11.942] } as any, company });
        const station3 = stationRepo.create({ name: 'Terminal La Oroya', city: 'La Oroya', location: { type: 'Point', coordinates: [-75.900, -11.520] } as any, company });
        const station4 = stationRepo.create({ name: 'Terminal Central', city: 'Huancayo', location: { type: 'Point', coordinates: [-75.204, -12.065] } as any, company });
        await stationRepo.save([station1, station2, station3, station4]);

        const routeRepo = queryRunner.manager.getRepository(RouteEntity);
        const waypointRepo = queryRunner.manager.getRepository(RouteWaypointEntity);

        const route = routeRepo.create({
            name: 'Lima -> Huancayo (Ruta Central)',
            serviceMode: ServiceMode.INTERPROVINCIAL,
            company: company
        });
        await routeRepo.save(route);

        const wp1 = waypointRepo.create({
            route,
            station: station1,
            stopOrder: 1,
            basePrice: 0 // Origen
        });
        const wp2 = waypointRepo.create({
            route,
            station: station2,
            stopOrder: 2,
            basePrice: 15.00
        });
        const wp3 = waypointRepo.create({
            route,
            station: station3,
            stopOrder: 3,
            basePrice: 20.00
        });
        const wp4 = waypointRepo.create({
            route,
            station: station4,
            stopOrder: 4,
            basePrice: 10.00 // Total: 45.00
        });
        await waypointRepo.save([wp1, wp2, wp3, wp4]);

        console.log('📅 4. Creando Viaje Interprovincial Programado...');
        const tripRepo = queryRunner.manager.getRepository(TripEntity);
        const tripId = '11111111-1111-1111-1111-111111111111';
        const trip = tripRepo.create({
            id: tripId, 
            route,
            vehicle,
            departureTime: new Date(new Date().getTime() + 1000 * 60 * 60 * 2), // Dentro de 2 horas
            status: TripStatus.SCHEDULED
        });
        await tripRepo.save(trip);

        await queryRunner.commitTransaction();
        console.log('🎉 ¡Base de datos poblada exitosamente!');
        
        console.log('\\n--- DATOS CREADOS PARA PROBAR ---');
        console.log(`Trip ID: ${trip.id}`);
        console.log(`Start Waypoint ID (Lima): ${wp1.id}`);
        console.log(`End Waypoint ID (Huancayo): ${wp4.id}`);

    } catch (error) {
        console.error('❌ Error al poblar base de datos:', error);
        await queryRunner.rollbackTransaction();
    } finally {
        await queryRunner.release();
        await AppDataSource.destroy();
    }
}

seed();
