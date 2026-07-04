/**
 * Tests unitarios para PaymentService
 * Cubre pago con tarjeta (Culqi), pago con billetera digital (con bloqueo
 * pesimista anti doble-gasto) y recarga de billetera. Este servicio mueve
 * dinero real, así que cada rama de error se prueba explícitamente.
 */

import { PaymentStatus } from '../../bookings/domain/BookingEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockBookingRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        findOne: jest.fn(),
        save: jest.fn(),
    },
};

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        createQueryRunner: jest.fn(() => mockQueryRunner),
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'UserEntity') return mockUserRepo;
            return mockBookingRepo;
        }),
    },
}));

jest.mock('../../../infrastructure/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { PaymentService } from '../application/PaymentService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBooking(overrides: Record<string, any> = {}) {
    return {
        id: 'booking-001',
        seatId: 'A1',
        passengerName: 'Juan Pérez',
        price: 50,
        totalPrice: 50,
        paymentStatus: PaymentStatus.PENDING_DIGITAL,
        user: { id: 'user-001' },
        trip: { id: 'trip-001' },
        culqiChargeId: null,
        ...overrides,
    };
}

function makeUser(overrides: Record<string, any> = {}) {
    return {
        id: 'user-001',
        balance: 100,
        ...overrides,
    };
}

const cardPaymentData = {
    bookingId: 'booking-001',
    userId: 'user-001',
    culqiToken: 'tkn_test_123',
    email: 'juan@example.com',
};

const walletPaymentData = {
    bookingId: 'booking-001',
    userId: 'user-001',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
    let paymentService: PaymentService;

    beforeEach(() => {
        paymentService = new PaymentService();
        jest.clearAllMocks();
    });

    describe('processCardPayment()', () => {
        it('debe procesar un pago con tarjeta exitosamente y marcar la reserva como PAID', async () => {
            const booking = makeBooking();
            mockBookingRepo.findOne.mockResolvedValue(booking);
            mockBookingRepo.save.mockImplementation((b) => Promise.resolve(b));

            jest.spyOn(paymentService as any, 'createCulqiCharge').mockResolvedValue({
                id: 'ch_test_001',
                object: 'charge',
                amount: 5000,
                currency_code: 'PEN',
                email: cardPaymentData.email,
                outcome: { type: 'venta_exitosa', code: '000', merchant_message: 'ok', user_message: 'ok' },
                source: { id: 'tkn_test_123', type: 'card', card_number: '411111XXXXXX1111', brand: 'Visa' },
            });

            const result = await paymentService.processCardPayment(cardPaymentData);

            expect(result.success).toBe(true);
            expect(result.chargeId).toBe('ch_test_001');
            expect(booking.paymentStatus).toBe(PaymentStatus.PAID);
            expect(booking.culqiChargeId).toBe('ch_test_001');
            expect(mockBookingRepo.save).toHaveBeenCalledWith(booking);
        });

        it('debe lanzar error si la reserva no existe', async () => {
            mockBookingRepo.findOne.mockResolvedValue(null);

            await expect(paymentService.processCardPayment(cardPaymentData))
                .rejects.toThrow('Reserva no encontrada');
        });

        it('debe lanzar error si el usuario no es dueño de la reserva', async () => {
            mockBookingRepo.findOne.mockResolvedValue(makeBooking({ user: { id: 'otro-usuario' } }));

            await expect(paymentService.processCardPayment(cardPaymentData))
                .rejects.toThrow('No tienes permisos para pagar esta reserva');
        });

        it('debe lanzar error si la reserva ya fue pagada (PAID)', async () => {
            mockBookingRepo.findOne.mockResolvedValue(makeBooking({ paymentStatus: PaymentStatus.PAID }));

            await expect(paymentService.processCardPayment(cardPaymentData))
                .rejects.toThrow('Esta reserva ya fue pagada');
        });

        it('debe lanzar error si la reserva ya fue pagada (PAID_DIGITAL)', async () => {
            mockBookingRepo.findOne.mockResolvedValue(makeBooking({ paymentStatus: PaymentStatus.PAID_DIGITAL }));

            await expect(paymentService.processCardPayment(cardPaymentData))
                .rejects.toThrow('Esta reserva ya fue pagada');
        });

        it('debe rechazar el pago si Culqi devuelve un outcome distinto de venta_exitosa', async () => {
            const booking = makeBooking();
            mockBookingRepo.findOne.mockResolvedValue(booking);

            jest.spyOn(paymentService as any, 'createCulqiCharge').mockResolvedValue({
                id: 'ch_test_002',
                object: 'charge',
                amount: 5000,
                currency_code: 'PEN',
                email: cardPaymentData.email,
                outcome: { type: 'fondos_insuficientes', code: '301', merchant_message: 'rechazado', user_message: 'Fondos insuficientes' },
                source: { id: 'tkn_test_123', type: 'card', card_number: '411111XXXXXX1111', brand: 'Visa' },
            });

            await expect(paymentService.processCardPayment(cardPaymentData))
                .rejects.toThrow('Pago rechazado: Fondos insuficientes');

            // La reserva NO debe quedar marcada como pagada si Culqi rechazó el cargo
            expect(mockBookingRepo.save).not.toHaveBeenCalled();
        });

        it('debe propagar un error si la llamada a Culqi falla (ej. red caída)', async () => {
            const booking = makeBooking();
            mockBookingRepo.findOne.mockResolvedValue(booking);

            jest.spyOn(paymentService as any, 'createCulqiCharge').mockRejectedValue(new Error('Timeout de red'));

            await expect(paymentService.processCardPayment(cardPaymentData))
                .rejects.toThrow('Error al procesar el pago: Timeout de red');

            expect(mockBookingRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('processWalletPayment()', () => {
        it('debe pagar con billetera exitosamente, descontar saldo y marcar la reserva como PAID_DIGITAL', async () => {
            const booking = makeBooking();
            const user = makeUser({ balance: 100 });

            mockQueryRunner.manager.findOne
                .mockResolvedValueOnce(booking) // BookingEntity
                .mockResolvedValueOnce(user);   // UserEntity
            mockQueryRunner.manager.save.mockImplementation((entity) => Promise.resolve(entity));

            const result = await paymentService.processWalletPayment(walletPaymentData);

            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(50); // 100 - 50
            expect(booking.paymentStatus).toBe(PaymentStatus.PAID_DIGITAL);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('debe usar bloqueo pesimista (pessimistic_write) al leer la reserva y al usuario, para evitar doble gasto concurrente', async () => {
            const booking = makeBooking();
            const user = makeUser({ balance: 100 });

            mockQueryRunner.manager.findOne
                .mockResolvedValueOnce(booking)
                .mockResolvedValueOnce(user);
            mockQueryRunner.manager.save.mockImplementation((entity) => Promise.resolve(entity));

            await paymentService.processWalletPayment(walletPaymentData);

            expect(mockQueryRunner.manager.findOne).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
                lock: { mode: 'pessimistic_write' },
            }));
            expect(mockQueryRunner.manager.findOne).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
                lock: { mode: 'pessimistic_write' },
            }));
        });

        it('debe hacer rollback si la reserva no existe', async () => {
            mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);

            await expect(paymentService.processWalletPayment(walletPaymentData))
                .rejects.toThrow('Reserva no encontrada');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.release).toHaveBeenCalled();
        });

        it('debe hacer rollback si el usuario no es dueño de la reserva', async () => {
            mockQueryRunner.manager.findOne.mockResolvedValueOnce(makeBooking({ user: { id: 'otro-usuario' } }));

            await expect(paymentService.processWalletPayment(walletPaymentData))
                .rejects.toThrow('No tienes permisos para pagar esta reserva');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe hacer rollback si la reserva ya fue pagada', async () => {
            mockQueryRunner.manager.findOne.mockResolvedValueOnce(makeBooking({ paymentStatus: PaymentStatus.PAID }));

            await expect(paymentService.processWalletPayment(walletPaymentData))
                .rejects.toThrow('Esta reserva ya fue pagada');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe hacer rollback si el usuario no existe', async () => {
            mockQueryRunner.manager.findOne
                .mockResolvedValueOnce(makeBooking())
                .mockResolvedValueOnce(null);

            await expect(paymentService.processWalletPayment(walletPaymentData))
                .rejects.toThrow('Usuario no encontrado');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('debe hacer rollback si el saldo es insuficiente, sin descontar nada', async () => {
            const booking = makeBooking({ price: 200 });
            const user = makeUser({ balance: 50 });

            mockQueryRunner.manager.findOne
                .mockResolvedValueOnce(booking)
                .mockResolvedValueOnce(user);

            await expect(paymentService.processWalletPayment(walletPaymentData))
                .rejects.toThrow('Saldo insuficiente');

            expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(user.balance).toBe(50); // sin modificar
        });
    });

    describe('rechargeWallet()', () => {
        const rechargeData = { userId: 'user-001', amount: 50, culqiToken: 'tkn_test_456', email: 'juan@example.com' };

        it('debe recargar la billetera exitosamente y acreditar el saldo', async () => {
            const user = makeUser({ balance: 20 });
            jest.spyOn(paymentService as any, 'createCulqiCharge').mockResolvedValue({
                id: 'ch_test_recharge_001',
                object: 'charge',
                amount: 5000,
                currency_code: 'PEN',
                email: rechargeData.email,
                outcome: { type: 'venta_exitosa', code: '000', merchant_message: 'ok', user_message: 'ok' },
                source: { id: 'tkn_test_456', type: 'card', card_number: '411111XXXXXX1111', brand: 'Visa' },
            });
            mockUserRepo.findOne.mockResolvedValue(user);
            mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

            const result = await paymentService.rechargeWallet(rechargeData);

            expect(result.newBalance).toBe(70); // 20 + 50
            expect(result.chargeId).toBe('ch_test_recharge_001');
        });

        it('debe rechazar montos menores a S/. 10.00 sin llamar a Culqi', async () => {
            const chargeSpy = jest.spyOn(paymentService as any, 'createCulqiCharge');

            await expect(paymentService.rechargeWallet({ ...rechargeData, amount: 5 }))
                .rejects.toThrow('El monto mínimo de recarga es S/. 10.00');

            expect(chargeSpy).not.toHaveBeenCalled();
        });

        it('debe rechazar montos mayores a S/. 1,000.00 sin llamar a Culqi', async () => {
            const chargeSpy = jest.spyOn(paymentService as any, 'createCulqiCharge');

            await expect(paymentService.rechargeWallet({ ...rechargeData, amount: 1500 }))
                .rejects.toThrow('El monto máximo de recarga es S/. 1,000.00');

            expect(chargeSpy).not.toHaveBeenCalled();
        });

        it('debe lanzar error si Culqi rechaza la recarga', async () => {
            jest.spyOn(paymentService as any, 'createCulqiCharge').mockResolvedValue({
                id: 'ch_test_recharge_002',
                object: 'charge',
                amount: 5000,
                currency_code: 'PEN',
                email: rechargeData.email,
                outcome: { type: 'tarjeta_invalida', code: '400', merchant_message: 'rechazado', user_message: 'Tarjeta inválida' },
                source: { id: 'tkn_test_456', type: 'card', card_number: '411111XXXXXX1111', brand: 'Visa' },
            });

            await expect(paymentService.rechargeWallet(rechargeData))
                .rejects.toThrow('Recarga rechazada: Tarjeta inválida');

            expect(mockUserRepo.save).not.toHaveBeenCalled();
        });

        it('debe lanzar error si el usuario no existe (aun con el cargo ya exitoso)', async () => {
            jest.spyOn(paymentService as any, 'createCulqiCharge').mockResolvedValue({
                id: 'ch_test_recharge_003',
                object: 'charge',
                amount: 5000,
                currency_code: 'PEN',
                email: rechargeData.email,
                outcome: { type: 'venta_exitosa', code: '000', merchant_message: 'ok', user_message: 'ok' },
                source: { id: 'tkn_test_456', type: 'card', card_number: '411111XXXXXX1111', brand: 'Visa' },
            });
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(paymentService.rechargeWallet(rechargeData))
                .rejects.toThrow('Usuario no encontrado');
        });
    });
});
