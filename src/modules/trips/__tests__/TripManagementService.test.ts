/**
 * Tests unitarios para TripManagementService
 * Verifica la lógica de programación de viajes y transiciones de estado
 */

import { TripStatus } from '../domain/TripEntity';
import { PaymentStatus } from '../../bookings/domain/BookingEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockTripQB = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
};

const mockTripRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => mockTripQB),
};

const mockRouteRepo = {
    findOne: jest.fn(),
};

const mockVehicleRepo = {
    findOne: jest.fn(),
};

const mockBookingRepo = {
    find: jest.fn(),
};

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'TripEntity') return mockTripRepo;
            if (name === 'RouteEntity') return mockRouteRepo;
            if (name === 'VehicleEntity') return mockVehicleRepo;
            if (name === 'BookingEntity') return mockBookingRepo;
            return mockTripRepo;
        }),
    },
}));

jest.mock('../../../infrastructure/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockEmitToTrip = jest.fn();
jest.mock('../../../infrastructure/sockets/SocketBus', () => ({
    emitToTrip: (...args: unknown[]) => mockEmitToTrip(...args),
}));

import { TripManagementService } from '../application/TripManagementService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCompany = { id: 'company-001', tradeName: 'Transportes Lima' };
const mockRoute = { id: 'route-001', name: 'Lima - Huancayo', company: mockCompany };
const mockVehicle = {
    id: 'vehicle-001',
    plateNumber: 'ABC-123',
    company: mockCompany,
    isActive: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TripManagementService', () => {
    let service: TripManagementService;

    beforeEach(() => {
        service = new TripManagementService();
        jest.clearAllMocks();
    });

    // ─── create ───────────────────────────────────────────────────────────────

    describe('create()', () => {
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // mañana

        it('debe crear un viaje correctamente', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockVehicleRepo.findOne.mockResolvedValue(mockVehicle);
            mockTripQB.getOne.mockResolvedValue(null); // Sin conflictos
            const savedTrip = {
                id: 'trip-001',
                route: mockRoute,
                vehicle: mockVehicle,
                departureTime: futureDate,
                status: TripStatus.SCHEDULED,
            };
            mockTripRepo.create.mockReturnValue(savedTrip);
            mockTripRepo.save.mockResolvedValue(savedTrip);

            const result = await service.create({
                routeId: 'route-001',
                vehicleId: 'vehicle-001',
                departureTime: futureDate,
            });

            expect(result.status).toBe(TripStatus.SCHEDULED);
            expect(result.id).toBe('trip-001');
        });

        it('debe lanzar error si la ruta no existe', async () => {
            mockRouteRepo.findOne.mockResolvedValue(null);

            await expect(service.create({
                routeId: 'no-existe',
                vehicleId: 'vehicle-001',
                departureTime: futureDate,
            })).rejects.toThrow('Ruta no encontrada');
        });

        it('debe lanzar error si el vehículo no existe', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockVehicleRepo.findOne.mockResolvedValue(null);

            await expect(service.create({
                routeId: 'route-001',
                vehicleId: 'no-existe',
                departureTime: futureDate,
            })).rejects.toThrow('Vehículo no encontrado');
        });

        it('debe lanzar error si la ruta y el vehículo son de empresas distintas', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockVehicleRepo.findOne.mockResolvedValue({
                ...mockVehicle,
                company: { id: 'otra-empresa', tradeName: 'Otra Empresa' },
            });

            await expect(service.create({
                routeId: 'route-001',
                vehicleId: 'vehicle-001',
                departureTime: futureDate,
            })).rejects.toThrow('misma empresa');
        });

        it('debe lanzar error si el vehículo está inactivo', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockVehicleRepo.findOne.mockResolvedValue({ ...mockVehicle, isActive: false });

            await expect(service.create({
                routeId: 'route-001',
                vehicleId: 'vehicle-001',
                departureTime: futureDate,
            })).rejects.toThrow('inactivo');
        });

        it('debe lanzar error si la fecha de salida es en el pasado', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockVehicleRepo.findOne.mockResolvedValue(mockVehicle);

            const pastDate = new Date(Date.now() - 60 * 60 * 1000); // hace 1 hora

            await expect(service.create({
                routeId: 'route-001',
                vehicleId: 'vehicle-001',
                departureTime: pastDate,
            })).rejects.toThrow('debe ser en el futuro');
        });

        it('debe lanzar error si el vehículo ya tiene un viaje ese día', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockVehicleRepo.findOne.mockResolvedValue(mockVehicle);
            mockTripQB.getOne.mockResolvedValue({ id: 'existing-trip' }); // Conflicto

            await expect(service.create({
                routeId: 'route-001',
                vehicleId: 'vehicle-001',
                departureTime: futureDate,
            })).rejects.toThrow('ya tiene un viaje programado');
        });
    });

    // ─── updateStatus ─────────────────────────────────────────────────────────

    describe('updateStatus()', () => {
        it('debe cambiar de SCHEDULED a BOARDING', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.SCHEDULED });
            mockTripRepo.save.mockResolvedValue({ id: 't1', status: TripStatus.BOARDING });

            const result = await service.updateStatus({ tripId: 't1', status: TripStatus.BOARDING });
            expect(result.status).toBe(TripStatus.BOARDING);
        });

        it('debe cambiar de BOARDING a IN_TRANSIT', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.BOARDING });
            mockTripRepo.save.mockResolvedValue({ id: 't1', status: TripStatus.IN_TRANSIT });

            const result = await service.updateStatus({ tripId: 't1', status: TripStatus.IN_TRANSIT });
            expect(result.status).toBe(TripStatus.IN_TRANSIT);
        });

        it('debe cambiar de IN_TRANSIT a COMPLETED', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.IN_TRANSIT });
            mockTripRepo.save.mockResolvedValue({ id: 't1', status: TripStatus.COMPLETED });

            const result = await service.updateStatus({ tripId: 't1', status: TripStatus.COMPLETED });
            expect(result.status).toBe(TripStatus.COMPLETED);
        });

        it('NO debe permitir cambiar de COMPLETED a ningún estado', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.COMPLETED });

            await expect(service.updateStatus({ tripId: 't1', status: TripStatus.SCHEDULED }))
                .rejects.toThrow('No se puede cambiar');
        });

        it('NO debe permitir cambiar de CANCELLED a ningún estado', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.CANCELLED });

            await expect(service.updateStatus({ tripId: 't1', status: TripStatus.BOARDING }))
                .rejects.toThrow('No se puede cambiar');
        });

        it('NO debe permitir saltar de SCHEDULED a COMPLETED directamente', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.SCHEDULED });

            await expect(service.updateStatus({ tripId: 't1', status: TripStatus.COMPLETED }))
                .rejects.toThrow('No se puede cambiar');
        });

        it('debe lanzar error si el viaje no existe', async () => {
            mockTripRepo.findOne.mockResolvedValue(null);

            await expect(service.updateStatus({ tripId: 'no-existe', status: TripStatus.BOARDING }))
                .rejects.toThrow('Viaje no encontrado');
        });

        it('debe emitir "boarding_started" por socket al pasar a BOARDING', async () => {
            const departureTime = new Date('2026-07-10T20:00:00.000Z');
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.SCHEDULED, departureTime });
            mockTripRepo.save.mockResolvedValue({ id: 't1', status: TripStatus.BOARDING, departureTime });

            await service.updateStatus({ tripId: 't1', status: TripStatus.BOARDING });

            expect(mockEmitToTrip).toHaveBeenCalledWith(
                't1', 'trip_status_changed',
                expect.objectContaining({ tripId: 't1', previousStatus: TripStatus.SCHEDULED, status: TripStatus.BOARDING })
            );
            expect(mockEmitToTrip).toHaveBeenCalledWith(
                't1', 'boarding_started',
                expect.objectContaining({ tripId: 't1', departureTime })
            );
        });

        it('NO debe emitir "boarding_started" en otras transiciones (solo trip_status_changed)', async () => {
            mockTripRepo.findOne.mockResolvedValue({ id: 't1', status: TripStatus.BOARDING });
            mockTripRepo.save.mockResolvedValue({ id: 't1', status: TripStatus.IN_TRANSIT });

            await service.updateStatus({ tripId: 't1', status: TripStatus.IN_TRANSIT });

            expect(mockEmitToTrip).toHaveBeenCalledTimes(1);
            expect(mockEmitToTrip).toHaveBeenCalledWith('t1', 'trip_status_changed', expect.anything());
        });
    });

    // ─── getPassengerManifest ─────────────────────────────────────────────────

    describe('getPassengerManifest()', () => {
        it('debe incluir pasajeros con PENDING_CASH, PAID_DIGITAL y PAID', async () => {
            const bookings = [
                {
                    id: 'b1',
                    passengerName: 'Juan',
                    passengerDocType: 'DNI',
                    passengerDocNum: '11111111',
                    seatId: 'A1',
                    totalPrice: 40,
                    paymentStatus: PaymentStatus.PENDING_CASH,
                    paymentMethod: 'CASH',
                    startWaypoint: { station: { name: 'Lima' } },
                    endWaypoint: { station: { name: 'Huancayo' } },
                },
                {
                    id: 'b2',
                    passengerName: 'María',
                    passengerDocType: 'DNI',
                    passengerDocNum: '22222222',
                    seatId: 'A2',
                    totalPrice: 40,
                    paymentStatus: PaymentStatus.PAID_DIGITAL,
                    paymentMethod: 'CARD',
                    startWaypoint: { station: { name: 'Lima' } },
                    endWaypoint: { station: { name: 'Huancayo' } },
                },
            ];
            mockBookingRepo.find.mockResolvedValue(bookings);

            const manifest = await service.getPassengerManifest('trip-001');

            expect(manifest).toHaveLength(2);
            expect(manifest[0].passengerName).toBe('Juan');
            expect(manifest[1].passengerName).toBe('María');
            expect(manifest[1].paymentStatus).toBe(PaymentStatus.PAID_DIGITAL);
        });

        it('debe retornar lista vacía si no hay pasajeros', async () => {
            mockBookingRepo.find.mockResolvedValue([]);

            const manifest = await service.getPassengerManifest('trip-vacio');
            expect(manifest).toHaveLength(0);
        });
    });
});
