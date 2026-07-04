/**
 * Tests unitarios para BookingService
 * Verifica la lógica de overbooking tramificado y cálculo de precios
 */

import { PaymentStatus } from '../domain/BookingEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
};

const mockBookingRepo = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
};

const mockTripRepo = {
    findOne: jest.fn(),
};

const mockWaypointRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
};

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'BookingEntity') return mockBookingRepo;
            if (name === 'TripEntity') return mockTripRepo;
            if (name === 'RouteWaypointEntity') return mockWaypointRepo;
            return mockBookingRepo;
        }),
    },
};

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        createQueryRunner: jest.fn(() => mockQueryRunner),
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'BookingEntity') return mockBookingRepo;
            return mockBookingRepo;
        }),
    },
}));

jest.mock('../../../infrastructure/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { BookingService } from '../application/BookingService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockTrip = {
    id: 'trip-001',
    route: { id: 'route-001' },
    status: 'SCHEDULED',
};

const mockStartWaypoint = { id: 'wp-lima', stopOrder: 1, basePrice: 0 };
const mockEndWaypoint = { id: 'wp-huancayo', stopOrder: 3, basePrice: 0 };

const mockAllWaypoints = [
    { id: 'wp-lima', stopOrder: 1, basePrice: 0 },
    { id: 'wp-junin', stopOrder: 2, basePrice: 25 },
    { id: 'wp-huancayo', stopOrder: 3, basePrice: 15 },
];

const baseBookingData = {
    tripId: 'trip-001',
    passengerName: 'Juan Pérez',
    passengerDocType: 'DNI',
    passengerDocNum: '12345678',
    startWaypointId: 'wp-lima',
    endWaypointId: 'wp-huancayo',
    seatId: 'A1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BookingService', () => {
    let bookingService: BookingService;

    beforeEach(() => {
        bookingService = new BookingService();
        jest.clearAllMocks();
    });

    describe('createCashBooking()', () => {
        it('debe crear una reserva al contado correctamente', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]); // Sin conflictos
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);

            const savedBooking = {
                id: 'booking-001',
                ...baseBookingData,
                totalPrice: 40, // 25 + 15
                paymentStatus: PaymentStatus.PENDING_CASH,
            };
            mockBookingRepo.create.mockReturnValue(savedBooking);
            mockBookingRepo.save.mockResolvedValue(savedBooking);

            const result = await bookingService.createCashBooking(baseBookingData);

            expect(result.paymentStatus).toBe(PaymentStatus.PENDING_CASH);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('debe calcular el precio sumando los tramos intermedios', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);

            const capturedCreate = jest.fn().mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });
            mockBookingRepo.create = capturedCreate;
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });

            await bookingService.createCashBooking(baseBookingData);

            // El precio debe ser 25 (wp-junin) + 15 (wp-huancayo) = 40
            expect(capturedCreate).toHaveBeenCalledWith(
                expect.objectContaining({ totalPrice: 40 })
            );
        });

        it('debe cobrar el precio VIP (basePriceFloor1) cuando el asiento pertenece al piso 1 de un bus de dos pisos', async () => {
            const mockTripTwoFloors = {
                ...mockTrip,
                vehicle: {
                    seatTemplate: {
                        seats: [
                            { id: 'A1', floor: 1 },
                            { id: 'B1', floor: 2 },
                        ],
                    },
                },
            };
            const waypointsWithFloor1Price = [
                { id: 'wp-lima', stopOrder: 1, basePrice: 0, basePriceFloor1: 0 },
                { id: 'wp-junin', stopOrder: 2, basePrice: 25, basePriceFloor1: 35 },
                { id: 'wp-huancayo', stopOrder: 3, basePrice: 15, basePriceFloor1: 20 },
            ];

            mockTripRepo.findOne.mockResolvedValue(mockTripTwoFloors);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(waypointsWithFloor1Price);

            const capturedCreate = jest.fn().mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });
            mockBookingRepo.create = capturedCreate;
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });

            // Asiento A1 está en el piso 1 (VIP) → debe usar basePriceFloor1: 35 + 20 = 55
            await bookingService.createCashBooking({ ...baseBookingData, seatId: 'A1' });

            expect(capturedCreate).toHaveBeenCalledWith(
                expect.objectContaining({ totalPrice: 55 })
            );
        });

        it('debe cobrar el precio estándar (basePrice) cuando el asiento pertenece al piso 2, aunque el bus tenga precio VIP', async () => {
            const mockTripTwoFloors = {
                ...mockTrip,
                vehicle: {
                    seatTemplate: {
                        seats: [
                            { id: 'A1', floor: 1 },
                            { id: 'B1', floor: 2 },
                        ],
                    },
                },
            };
            const waypointsWithFloor1Price = [
                { id: 'wp-lima', stopOrder: 1, basePrice: 0, basePriceFloor1: 0 },
                { id: 'wp-junin', stopOrder: 2, basePrice: 25, basePriceFloor1: 35 },
                { id: 'wp-huancayo', stopOrder: 3, basePrice: 15, basePriceFloor1: 20 },
            ];

            mockTripRepo.findOne.mockResolvedValue(mockTripTwoFloors);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(waypointsWithFloor1Price);

            const capturedCreate = jest.fn().mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });
            mockBookingRepo.create = capturedCreate;
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });

            // Asiento B1 está en el piso 2 (estándar) → debe usar basePrice: 25 + 15 = 40
            await bookingService.createCashBooking({ ...baseBookingData, seatId: 'B1' });

            expect(capturedCreate).toHaveBeenCalledWith(
                expect.objectContaining({ totalPrice: 40 })
            );
        });

        it('debe lanzar error si el viaje no existe', async () => {
            mockTripRepo.findOne.mockResolvedValue(null);

            await expect(bookingService.createCashBooking(baseBookingData))
                .rejects.toThrow('Viaje no encontrado');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe lanzar error si el orden de waypoints es ilógico (destino antes que origen)', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            // Invertir el orden: start tiene stopOrder mayor que end
            mockWaypointRepo.findOne
                .mockResolvedValueOnce({ id: 'wp-huancayo', stopOrder: 3 }) // start
                .mockResolvedValueOnce({ id: 'wp-lima', stopOrder: 1 });    // end

            await expect(bookingService.createCashBooking(baseBookingData))
                .rejects.toThrow('Orden de ruta ilógico');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe lanzar error si el asiento ya está ocupado en el tramo', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            // Simular conflicto de overbooking
            mockQueryBuilder.getMany.mockResolvedValue([{ id: 'existing-booking' }]);

            await expect(bookingService.createCashBooking(baseBookingData))
                .rejects.toThrow('ya se encuentra ocupado');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe hacer rollback si ocurre un error inesperado', async () => {
            mockTripRepo.findOne.mockRejectedValue(new Error('DB connection lost'));

            await expect(bookingService.createCashBooking(baseBookingData))
                .rejects.toThrow('DB connection lost');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.release).toHaveBeenCalled();
        });
    });

    describe('cancelBooking()', () => {
        it('debe cancelar una reserva PENDING_CASH', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('debe cancelar una reserva PENDING_DIGITAL', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_DIGITAL,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('no debe cancelar una reserva ya PAID_DIGITAL', async () => {
            mockBookingRepo.findOne.mockResolvedValue({
                id: 'b1',
                paymentStatus: PaymentStatus.PAID_DIGITAL,
            });

            await expect(bookingService.cancelBooking('b1'))
                .rejects.toThrow('No se puede cancelar');
        });

        it('debe lanzar error si la reserva no existe', async () => {
            mockBookingRepo.findOne.mockResolvedValue(null);

            await expect(bookingService.cancelBooking('no-existe'))
                .rejects.toThrow('Reserva no encontrada');
        });
    });
});
