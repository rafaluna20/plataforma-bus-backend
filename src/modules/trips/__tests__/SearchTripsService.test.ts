/**
 * Tests unitarios para SearchTripsService
 * Cubre: filtros de búsqueda (origen/destino/fecha/empresa/tipo de vehículo),
 * paginación, caché de búsquedas completas, y el cálculo de asientos
 * disponibles (capacidad efectiva desde seatTemplate vs. columna capacity).
 */

import { TripStatus } from '../domain/TripEntity';
import { PaymentStatus } from '../../bookings/domain/BookingEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockTripQB = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
};

const mockBookingQB = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
};

const mockTripRepo = {
    createQueryBuilder: jest.fn(() => mockTripQB),
};

const mockBookingRepo = {
    createQueryBuilder: jest.fn(() => mockBookingQB),
};

// Sin reglas de tarifa configuradas → multiplicador 1 (no altera el precio base)
const mockFareRuleRepo = {
    find: jest.fn().mockResolvedValue([]),
};

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'BookingEntity') return mockBookingRepo;
            if (name === 'FareRuleEntity') return mockFareRuleRepo;
            return mockTripRepo;
        }),
    },
}));

const mockCache = { get: jest.fn(), set: jest.fn() };

jest.mock('../../../infrastructure/cache/RedisCache', () => ({
    cache: {
        get: (...args: any[]) => mockCache.get(...args),
        set: (...args: any[]) => mockCache.set(...args),
    },
    CacheKeys: {
        tripSearch: (origin: string, destination: string, date: string, page: number, limit: number) =>
            `trips:search:${origin}:${destination}:${date}:${page}:${limit}`,
    },
    CacheTTL: { TRIP_SEARCH: 300 },
}));

import { SearchTripsService } from '../application/SearchTripsService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrip(overrides: Record<string, any> = {}) {
    return {
        id: 'trip-001',
        status: TripStatus.SCHEDULED,
        departureTime: new Date('2026-08-01T08:00:00Z'),
        route: {
            id: 'route-001',
            company: { id: 'company-001' },
            waypoints: [
                { stopOrder: 2, station: { city: 'Huancayo' } },
                { stopOrder: 1, station: { city: 'Lima' } },
            ],
        },
        vehicle: { id: 'vehicle-001', vehicleType: 'BUS_1P', capacity: 40, seatTemplate: null },
        ...overrides,
    };
}

describe('SearchTripsService', () => {
    let service: SearchTripsService;

    beforeEach(() => {
        service = new SearchTripsService();
        jest.clearAllMocks();
        mockCache.get.mockResolvedValue(null);
        mockBookingQB.getRawMany.mockResolvedValue([]);
    });

    describe('execute() — filtros', () => {
        it('busca solo viajes futuros cuando no se especifica fecha', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({});

            expect(mockTripQB.andWhere).toHaveBeenCalledWith(
                'trip.departure_time >= :now',
                expect.objectContaining({ now: expect.any(Date) })
            );
            // Sin origen/destino no debe unir los waypoints de ruta
            expect(mockTripQB.innerJoin).not.toHaveBeenCalled();
        });

        it('filtra por rango del día completo cuando se especifica fecha', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);
            const travelDate = new Date('2026-08-01T00:00:00Z');

            await service.execute({ travelDate });

            expect(mockTripQB.andWhere).toHaveBeenCalledWith(
                'trip.departure_time BETWEEN :startOfDay AND :endOfDay',
                expect.objectContaining({ startOfDay: expect.any(Date), endOfDay: expect.any(Date) })
            );
        });

        it('agrega el join de origen/destino solo cuando ambos vienen juntos', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({ originCity: 'Lima' }); // solo origen, sin destino
            expect(mockTripQB.innerJoin).not.toHaveBeenCalled();

            jest.clearAllMocks();
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({ originCity: 'Lima', destinationCity: 'Huancayo' });
            expect(mockTripQB.innerJoin).toHaveBeenCalledWith('route.waypoints', 'originWp');
            expect(mockTripQB.andWhere).toHaveBeenCalledWith(
                'originWp.stop_order < destWp.stop_order'
            );
        });

        it('filtra por companyId y vehicleType cuando se proveen', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({ companyId: 'company-001', vehicleType: 'MINIVAN' });

            expect(mockTripQB.andWhere).toHaveBeenCalledWith('company.id = :companyId', { companyId: 'company-001' });
            expect(mockTripQB.andWhere).toHaveBeenCalledWith('vehicle.vehicle_type = :vehicleType', { vehicleType: 'MINIVAN' });
        });

        it('no filtra por empresa ni tipo de vehículo si no se proveen', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({});

            const calledWithCompany = mockTripQB.andWhere.mock.calls.some(c => c[0] === 'company.id = :companyId');
            const calledWithVehicle = mockTripQB.andWhere.mock.calls.some(c => c[0] === 'vehicle.vehicle_type = :vehicleType');
            expect(calledWithCompany).toBe(false);
            expect(calledWithVehicle).toBe(false);
        });
    });

    describe('execute() — paginación', () => {
        it('usa page=1 y limit=15 por defecto', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            const result = await service.execute({});

            expect(result.page).toBe(1);
            expect(mockTripQB.skip).toHaveBeenCalledWith(0);
            expect(mockTripQB.take).toHaveBeenCalledWith(15);
        });

        it('calcula el skip correcto para páginas mayores a 1', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({ page: 3, limit: 10 });

            expect(mockTripQB.skip).toHaveBeenCalledWith(20);
            expect(mockTripQB.take).toHaveBeenCalledWith(10);
        });

        it('limita el máximo a 50 resultados por página aunque se pida más', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({ limit: 500 });

            expect(mockTripQB.take).toHaveBeenCalledWith(50);
        });

        it('no permite página menor a 1', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            const result = await service.execute({ page: -5 });

            expect(result.page).toBe(1);
            expect(mockTripQB.skip).toHaveBeenCalledWith(0);
        });

        it('calcula totalPages a partir del total y el límite', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[makeTrip()], 22]);

            const result = await service.execute({ limit: 10 });

            expect(result.total).toBe(22);
            expect(result.totalPages).toBe(3);
        });
    });

    describe('execute() — asientos disponibles', () => {
        it('usa seatTemplate.totalSeats como capacidad efectiva cuando está presente', async () => {
            const trip = makeTrip({ vehicle: { id: 'v1', capacity: 40, seatTemplate: { totalSeats: 30 } } });
            mockTripQB.getManyAndCount.mockResolvedValue([[trip], 1]);
            mockBookingQB.getRawMany.mockResolvedValue([{ tripId: 'trip-001', occupied: '5' }]);

            const result = await service.execute({});

            expect((result.data[0] as any).availableSeats).toBe(25); // 30 - 5
        });

        it('cuenta asientos activos del arreglo seatTemplate.seats cuando no hay totalSeats', async () => {
            const seats = [
                { id: 'A1', active: true }, { id: 'A2', active: true }, { id: 'A3', active: false },
            ];
            const trip = makeTrip({ vehicle: { id: 'v1', capacity: 40, seatTemplate: { seats } } });
            mockTripQB.getManyAndCount.mockResolvedValue([[trip], 1]);
            mockBookingQB.getRawMany.mockResolvedValue([]);

            const result = await service.execute({});

            // 2 asientos activos (A3 está inactivo) - 0 ocupados
            expect((result.data[0] as any).availableSeats).toBe(2);
        });

        it('usa vehicle.capacity como fallback cuando no hay seatTemplate', async () => {
            const trip = makeTrip({ vehicle: { id: 'v1', capacity: 40, seatTemplate: null } });
            mockTripQB.getManyAndCount.mockResolvedValue([[trip], 1]);
            mockBookingQB.getRawMany.mockResolvedValue([{ tripId: 'trip-001', occupied: '10' }]);

            const result = await service.execute({});

            expect((result.data[0] as any).availableSeats).toBe(30); // 40 - 10
        });

        it('nunca retorna asientos disponibles negativos si hay sobreventa registrada', async () => {
            const trip = makeTrip({ vehicle: { id: 'v1', capacity: 10, seatTemplate: null } });
            mockTripQB.getManyAndCount.mockResolvedValue([[trip], 1]);
            mockBookingQB.getRawMany.mockResolvedValue([{ tripId: 'trip-001', occupied: '15' }]);

            const result = await service.execute({});

            expect((result.data[0] as any).availableSeats).toBe(0);
        });

        it('no consulta ocupación si la búsqueda no devuelve viajes', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({});

            expect(mockBookingRepo.createQueryBuilder).not.toHaveBeenCalled();
        });
    });

    describe('execute() — caché', () => {
        const cacheParams = { originCity: 'Lima', destinationCity: 'Huancayo', travelDate: new Date('2026-08-01T00:00:00Z') };

        it('solo cachea búsquedas completas (origen + destino + fecha)', async () => {
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);

            await service.execute({ originCity: 'Lima' }); // incompleta
            expect(mockCache.set).not.toHaveBeenCalled();

            jest.clearAllMocks();
            mockCache.get.mockResolvedValue(null);
            mockTripQB.getManyAndCount.mockResolvedValue([[], 0]);
            mockBookingQB.getRawMany.mockResolvedValue([]);

            await service.execute(cacheParams); // completa
            expect(mockCache.set).toHaveBeenCalledWith(
                expect.stringContaining('trips:search:Lima:Huancayo:2026-08-01'),
                expect.anything(),
                300
            );
        });

        it('en un HIT de caché no vuelve a consultar la base de datos de viajes', async () => {
            const cachedResult = { data: [makeTrip()], total: 1, page: 1, totalPages: 1 };
            mockCache.get.mockResolvedValue(cachedResult);
            mockBookingQB.getRawMany.mockResolvedValue([]);

            const result = await service.execute(cacheParams);

            expect(mockTripRepo.createQueryBuilder).not.toHaveBeenCalled();
            expect(result.data).toHaveLength(1);
        });

        it('recalcula los asientos disponibles incluso en un HIT de caché', async () => {
            const cachedTrip = makeTrip({ vehicle: { id: 'v1', capacity: 40, seatTemplate: null } });
            const cachedResult = { data: [cachedTrip], total: 1, page: 1, totalPages: 1 };
            mockCache.get.mockResolvedValue(cachedResult);
            mockBookingQB.getRawMany.mockResolvedValue([{ tripId: 'trip-001', occupied: '7' }]);

            const result = await service.execute(cacheParams);

            expect(mockBookingRepo.createQueryBuilder).toHaveBeenCalled();
            expect((result.data[0] as any).availableSeats).toBe(33); // 40 - 7
        });
    });
});
