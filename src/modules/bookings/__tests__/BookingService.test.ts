/**
 * Tests unitarios para BookingService
 * Verifica la lógica de overbooking tramificado y cálculo de precios
 */

import { PaymentStatus } from '../domain/BookingEntity';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';

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

// Sin reglas de tarifa configuradas → multiplicador 1 (no altera el precio base)
const mockFareRuleRepo = {
    find: jest.fn().mockResolvedValue([]),
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
        // Usado por assignTicketNumber() (UPDATE companies ... RETURNING ticket_next_number)
        query: jest.fn().mockResolvedValue([{ ticket_next_number: 1 }]),
    },
};

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        createQueryRunner: jest.fn(() => mockQueryRunner),
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'BookingEntity') return mockBookingRepo;
            if (name === 'FareRuleEntity') return mockFareRuleRepo;
            return mockBookingRepo;
        }),
    },
}));

jest.mock('../../../infrastructure/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { BookingService } from '../application/BookingService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCompany = { id: 'company-001', tradeName: 'Transportes Lima' };
const mockTrip = {
    id: 'trip-001',
    route: { id: 'route-001', company: mockCompany },
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

        it('NO debe permitir vender en un viaje CANCELADO', async () => {
            mockTripRepo.findOne.mockResolvedValue({ ...mockTrip, status: 'CANCELLED' });

            await expect(bookingService.createCashBooking(baseBookingData))
                .rejects.toThrow('viaje cancelado');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('NO debe permitir vender en un viaje ya COMPLETADO', async () => {
            mockTripRepo.findOne.mockResolvedValue({ ...mockTrip, status: 'COMPLETED' });

            await expect(bookingService.createCashBooking(baseBookingData))
                .rejects.toThrow('ya completado');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('SÍ debe permitir vender en un viaje IN_TRANSIT (venta de tramo intermedio)', async () => {
            mockTripRepo.findOne.mockResolvedValue({ ...mockTrip, status: 'IN_TRANSIT' });
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);
            mockBookingRepo.create.mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });

            await expect(bookingService.createCashBooking(baseBookingData)).resolves.not.toThrow();
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

        // ─── Tarifa dinámica y ajuste manual de precio ─────────────────────────

        it('debe aplicar el multiplicador de la regla de tarifa vigente al precio calculado', async () => {
            const tripWithDeparture = { ...mockTrip, departureTime: new Date('2026-07-15T14:00:00.000Z') }; // 09:00 Perú
            mockTripRepo.findOne.mockResolvedValue(tripWithDeparture);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);
            mockFareRuleRepo.find.mockResolvedValueOnce([
                { ruleType: 'TIME_BAND', startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 1.5, priority: 0, isActive: true },
            ]);

            const capturedCreate = jest.fn().mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });
            mockBookingRepo.create = capturedCreate;
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });

            await bookingService.createCashBooking(baseBookingData);

            // Precio base 40 (25+15) × 1.5 = 60
            expect(capturedCreate).toHaveBeenCalledWith(expect.objectContaining({ totalPrice: 60 }));
        });

        it('un ADMIN debe poder ajustar manualmente el precio con motivo', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);

            const savedBooking = { id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH, totalPrice: 25 };
            mockBookingRepo.create.mockReturnValue(savedBooking);
            mockBookingRepo.save.mockResolvedValue(savedBooking);

            const result = await bookingService.createCashBooking({
                ...baseBookingData,
                actorRole: UserRole.ADMIN,
                actorCompanyId: 'company-001',
                priceOverride: 25,
                overrideReason: 'Descuento autorizado',
            });

            // El precio "de sistema" (sin ajustar) viaja en la respuesta para que
            // el controller pueda auditar la diferencia -- no se persiste.
            expect((result as any).systemPrice).toBe(40);
        });

        it('NO debe permitir que un AGENCY_SELLER ajuste manualmente el precio', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);

            await expect(bookingService.createCashBooking({
                ...baseBookingData,
                actorRole: UserRole.AGENCY_SELLER,
                actorCompanyId: 'company-001',
                priceOverride: 10,
                overrideReason: 'Intento no autorizado',
            })).rejects.toThrow('Solo un ADMIN puede ajustar');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('reserveSeat()', () => {
        it('debe apartar un asiento con estado RESERVED sin cobrar', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);

            const capturedCreate = jest.fn().mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.RESERVED });
            mockBookingRepo.create = capturedCreate;
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.RESERVED });

            const result = await bookingService.reserveSeat(baseBookingData);

            expect(result.paymentStatus).toBe(PaymentStatus.RESERVED);
            expect(capturedCreate).toHaveBeenCalledWith(
                expect.objectContaining({ paymentStatus: PaymentStatus.RESERVED, totalPrice: 40 })
            );
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        });

        it('debe rechazar reservar un asiento ya ocupado en ese tramo', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([{ id: 'existing' }]); // conflicto

            await expect(bookingService.reserveSeat(baseBookingData))
                .rejects.toThrow('ya se encuentra ocupado');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('confirmReservation()', () => {
        const reservedBooking = {
            id: 'b1',
            paymentStatus: PaymentStatus.RESERVED,
            totalPrice: 40,
            trip: mockTrip, // company-001
        };

        it('debe confirmar hacia PENDING_CASH cuando el metodo es efectivo', async () => {
            mockBookingRepo.findOne.mockResolvedValue({ ...reservedBooking });
            mockBookingRepo.save.mockImplementation((b: any) => Promise.resolve(b));

            const result = await bookingService.confirmReservation(
                'b1', 'cash', UserRole.ADMIN, 'company-001'
            );

            expect(result.paymentStatus).toBe(PaymentStatus.PENDING_CASH);
            expect(result.paymentMethod).toBe('CASH');
        });

        it('debe confirmar hacia PAID_DIGITAL cuando el pago digital es exitoso', async () => {
            mockBookingRepo.findOne.mockResolvedValue({ ...reservedBooking });
            mockBookingRepo.save.mockImplementation((b: any) => Promise.resolve(b));
            const mockGateway = {
                processPayment: jest.fn().mockResolvedValue({ success: true, transactionId: 'txn-123' }),
            };

            const result = await bookingService.confirmReservation(
                'b1', 'digital', UserRole.ADMIN, 'company-001',
                mockGateway as any, { method: 'YAPE' } as any
            );

            expect(result.paymentStatus).toBe(PaymentStatus.PAID_DIGITAL);
            expect(result.paymentGatewayRef).toBe('txn-123');
        });

        it('debe dejar la reserva en RESERVED si el pago digital es rechazado', async () => {
            mockBookingRepo.findOne.mockResolvedValue({ ...reservedBooking });
            const mockGateway = {
                processPayment: jest.fn().mockResolvedValue({ success: false, errorMessage: 'Fondos insuficientes' }),
            };

            await expect(bookingService.confirmReservation(
                'b1', 'digital', UserRole.ADMIN, 'company-001',
                mockGateway as any, { method: 'YAPE' } as any
            )).rejects.toThrow('Pago rechazado');

            expect(mockBookingRepo.save).not.toHaveBeenCalled();
        });

        it('NO debe permitir confirmar una reserva de OTRA empresa', async () => {
            mockBookingRepo.findOne.mockResolvedValue({ ...reservedBooking });

            await expect(bookingService.confirmReservation(
                'b1', 'cash', UserRole.ADMIN, 'otra-empresa'
            )).rejects.toThrow('No tienes permisos');
        });

        it('NO debe confirmar una reserva que ya no está en estado RESERVED', async () => {
            mockBookingRepo.findOne.mockResolvedValue({ ...reservedBooking, paymentStatus: PaymentStatus.PENDING_CASH });

            await expect(bookingService.confirmReservation(
                'b1', 'cash', UserRole.ADMIN, 'company-001'
            )).rejects.toThrow('No se puede confirmar');
        });

        it('SUPER_ADMIN debe poder confirmar cualquier reserva sin importar la empresa', async () => {
            mockBookingRepo.findOne.mockResolvedValue({ ...reservedBooking });
            mockBookingRepo.save.mockImplementation((b: any) => Promise.resolve(b));

            const result = await bookingService.confirmReservation(
                'b1', 'cash', UserRole.SUPER_ADMIN, undefined
            );

            expect(result.paymentStatus).toBe(PaymentStatus.PENDING_CASH);
        });
    });

    describe('cancelBooking()', () => {
        it('no debe exponer passwordHash ni refreshToken del pasajero en la respuesta', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: { id: 'owner-1', email: 'owner@test.com', passwordHash: 'hash-secreto', refreshToken: 'token-secreto' },
                trip: mockTrip,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'owner-1');
            expect((result.user as any).passwordHash).toBeUndefined();
            expect((result.user as any).refreshToken).toBeUndefined();
            expect(result.user?.email).toBe('owner@test.com');
        });

        it('debe permitir a staff cancelar una reserva en estado RESERVED (nadie la confirmó)', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.RESERVED,
                user: null,
                trip: mockTrip, // company-001
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', undefined, UserRole.AGENCY_SELLER, 'company-001');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('debe permitir al dueño de la reserva cancelar una PENDING_CASH', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: { id: 'owner-1' },
                trip: mockTrip,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'owner-1');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('debe permitir al dueño de la reserva cancelar una PENDING_DIGITAL', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_DIGITAL,
                user: { id: 'owner-1' },
                trip: mockTrip,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'owner-1');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('debe permitir cancelar una reserva ya PAID_DIGITAL (el pasajero pagó pero ya no viaja)', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PAID_DIGITAL,
                user: { id: 'owner-1' },
                trip: mockTrip,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'owner-1');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('debe permitir cancelar una reserva ya PAID', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PAID,
                user: { id: 'owner-1' },
                trip: mockTrip,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'owner-1');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it.each([PaymentStatus.CANCELLED, PaymentStatus.FAILED, PaymentStatus.REFUNDED])(
            'no debe volver a cancelar una reserva ya %s (estado terminal)',
            async (status) => {
                mockBookingRepo.findOne.mockResolvedValue({
                    id: 'b1',
                    paymentStatus: status,
                    user: { id: 'owner-1' },
                    trip: mockTrip,
                });

                await expect(bookingService.cancelBooking('b1', 'owner-1'))
                    .rejects.toThrow('No se puede cancelar');
            }
        );

        it('debe lanzar error si la reserva no existe', async () => {
            mockBookingRepo.findOne.mockResolvedValue(null);

            await expect(bookingService.cancelBooking('no-existe'))
                .rejects.toThrow('Reserva no encontrada');
        });

        // ─── Multi-tenancy: quién puede cancelar la reserva de otro ──────────

        it('NO debe permitir que un usuario que no es el dueño ni staff cancele la reserva', async () => {
            mockBookingRepo.findOne.mockResolvedValue({
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: { id: 'owner-1' },
                trip: mockTrip,
            });

            await expect(bookingService.cancelBooking('b1', 'otro-usuario-cualquiera'))
                .rejects.toThrow('No tienes permisos');
        });

        it('debe permitir a un ADMIN de la MISMA empresa del viaje cancelar la reserva de otro usuario', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: { id: 'owner-1' },
                trip: mockTrip, // company-001
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'admin-id', UserRole.ADMIN, 'company-001');
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });

        it('NO debe permitir a un ADMIN de OTRA empresa cancelar la reserva', async () => {
            mockBookingRepo.findOne.mockResolvedValue({
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: { id: 'owner-1' },
                trip: mockTrip, // company-001
            });

            await expect(
                bookingService.cancelBooking('b1', 'admin-otra-empresa', UserRole.ADMIN, 'otra-empresa')
            ).rejects.toThrow('No tienes permisos');
        });

        it('SUPER_ADMIN debe poder cancelar cualquier reserva sin importar la empresa', async () => {
            const booking = {
                id: 'b1',
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: { id: 'owner-1' },
                trip: mockTrip,
            };
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockResolvedValue({ ...booking, paymentStatus: PaymentStatus.CANCELLED });

            const result = await bookingService.cancelBooking('b1', 'super-admin-id', UserRole.SUPER_ADMIN, undefined);
            expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
        });
    });

    describe('scoping por empresa (createCashBooking)', () => {
        it('NO debe permitir que un AGENCY_SELLER de otra empresa venda pasajes en este viaje', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip); // company-001

            await expect(bookingService.createCashBooking({
                ...baseBookingData,
                actorRole: UserRole.AGENCY_SELLER,
                actorCompanyId: 'otra-empresa',
            })).rejects.toThrow('otra empresa');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe permitir que un PASSENGER autocompre en cualquier empresa (sin scoping)', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockQueryBuilder.getMany.mockResolvedValue([]);
            mockWaypointRepo.find.mockResolvedValue(mockAllWaypoints);
            mockBookingRepo.create.mockReturnValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });
            mockBookingRepo.save.mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PENDING_CASH });

            await expect(bookingService.createCashBooking({
                ...baseBookingData,
                actorRole: UserRole.PASSENGER,
                actorCompanyId: undefined,
            })).resolves.not.toThrow();
        });
    });
});
