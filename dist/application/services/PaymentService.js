"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const data_source_1 = require("../../infrastructure/database/data-source");
const BookingEntity_1 = require("../../infrastructure/database/entities/BookingEntity");
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const logger_1 = require("../../infrastructure/logger");
/**
 * Servicio de Pagos — Integración con Culqi (pasarela peruana)
 *
 * Culqi es la pasarela de pagos líder en Perú.
 * Documentación: https://apidocs.culqi.com/
 *
 * Flujo de pago:
 * 1. Frontend tokeniza la tarjeta con Culqi.js → obtiene un token de un solo uso
 * 2. Backend recibe el token y crea un cargo en Culqi
 * 3. Si el cargo es exitoso, se actualiza el estado de la reserva
 * 4. Se acredita el saldo al usuario si aplica (billetera digital)
 */
const CULQI_SECRET_KEY = process.env.CULQI_SECRET_KEY || '';
const CULQI_API_URL = 'https://api.culqi.com/v2';
class PaymentService {
    get bookingRepo() {
        return data_source_1.AppDataSource.getRepository(BookingEntity_1.BookingEntity);
    }
    get userRepo() {
        return data_source_1.AppDataSource.getRepository(UserEntity_1.UserEntity);
    }
    /**
     * Procesar pago con tarjeta de crédito/débito via Culqi.
     * El frontend debe tokenizar la tarjeta con Culqi.js primero.
     */
    async processCardPayment(data) {
        // 1. Obtener la reserva y validar que esté pendiente
        const booking = await this.bookingRepo.findOne({
            where: { id: data.bookingId },
            relations: { user: true, trip: true },
        });
        if (!booking)
            throw new Error('Reserva no encontrada');
        if (booking.user.id !== data.userId)
            throw new Error('No tienes permisos para pagar esta reserva');
        if (booking.paymentStatus === BookingEntity_1.PaymentStatus.PAID || booking.paymentStatus === BookingEntity_1.PaymentStatus.PAID_DIGITAL) {
            throw new Error('Esta reserva ya fue pagada');
        }
        // 2. Calcular monto en centavos (Culqi trabaja en centavos)
        const amountInCents = Math.round(booking.price * 100);
        // 3. Crear cargo en Culqi
        const chargePayload = {
            amount: amountInCents,
            currency_code: 'PEN',
            email: data.email,
            source_id: data.culqiToken,
            description: `Reserva de transporte - Asiento ${booking.seatId}`,
            metadata: {
                booking_id: booking.id,
                trip_id: booking.trip.id,
                passenger: booking.passengerName,
            },
        };
        let chargeResponse;
        try {
            chargeResponse = await this.createCulqiCharge(chargePayload);
        }
        catch (error) {
            logger_1.logger.error(`[Payment] Error al procesar cargo Culqi: ${error.message}`, {
                bookingId: data.bookingId,
                amount: amountInCents,
            });
            throw new Error(`Error al procesar el pago: ${error.message}`);
        }
        // 4. Verificar que el cargo fue exitoso
        if (chargeResponse.outcome?.type !== 'venta_exitosa') {
            const userMessage = chargeResponse.outcome?.user_message || 'Pago rechazado';
            logger_1.logger.warn(`[Payment] Cargo rechazado: ${userMessage}`, { bookingId: data.bookingId });
            throw new Error(`Pago rechazado: ${userMessage}`);
        }
        // 5. Actualizar estado de la reserva
        booking.paymentStatus = BookingEntity_1.PaymentStatus.PAID;
        booking.culqiChargeId = chargeResponse.id;
        const savedBooking = await this.bookingRepo.save(booking);
        logger_1.logger.info(`[Payment] Pago exitoso: booking=${data.bookingId} | charge=${chargeResponse.id} | amount=S/.${booking.price}`);
        return {
            success: true,
            chargeId: chargeResponse.id,
            message: `Pago de S/. ${booking.price.toFixed(2)} procesado exitosamente`,
            booking: savedBooking,
        };
    }
    /**
     * Pagar una reserva usando el saldo de la billetera digital del usuario.
     */
    async processWalletPayment(data) {
        const queryRunner = data_source_1.AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            // 1. Obtener reserva y usuario con bloqueo para evitar race conditions
            const booking = await queryRunner.manager.findOne(BookingEntity_1.BookingEntity, {
                where: { id: data.bookingId },
                relations: { user: true },
                lock: { mode: 'pessimistic_write' },
            });
            if (!booking)
                throw new Error('Reserva no encontrada');
            if (booking.user.id !== data.userId)
                throw new Error('No tienes permisos para pagar esta reserva');
            if (booking.paymentStatus === BookingEntity_1.PaymentStatus.PAID || booking.paymentStatus === BookingEntity_1.PaymentStatus.PAID_DIGITAL) {
                throw new Error('Esta reserva ya fue pagada');
            }
            const user = await queryRunner.manager.findOne(UserEntity_1.UserEntity, {
                where: { id: data.userId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!user)
                throw new Error('Usuario no encontrado');
            // 2. Verificar saldo suficiente
            const price = Number(booking.price);
            const balance = Number(user.balance);
            if (balance < price) {
                throw new Error(`Saldo insuficiente. Tienes S/. ${balance.toFixed(2)} y el precio es S/. ${price.toFixed(2)}`);
            }
            // 3. Descontar saldo
            user.balance = parseFloat((balance - price).toFixed(2));
            await queryRunner.manager.save(user);
            // 4. Actualizar estado de la reserva
            booking.paymentStatus = BookingEntity_1.PaymentStatus.PAID_DIGITAL;
            const savedBooking = await queryRunner.manager.save(booking);
            await queryRunner.commitTransaction();
            logger_1.logger.info(`[Payment] Pago con billetera: booking=${data.bookingId} | user=${data.userId} | amount=S/.${price} | newBalance=S/.${user.balance}`);
            return {
                success: true,
                newBalance: user.balance,
                message: `Pago de S/. ${price.toFixed(2)} realizado con tu billetera. Saldo restante: S/. ${user.balance.toFixed(2)}`,
                booking: savedBooking,
            };
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    /**
     * Recargar saldo en la billetera digital del usuario via Culqi.
     */
    async rechargeWallet(data) {
        if (data.amount < 10)
            throw new Error('El monto mínimo de recarga es S/. 10.00');
        if (data.amount > 1000)
            throw new Error('El monto máximo de recarga es S/. 1,000.00');
        const amountInCents = Math.round(data.amount * 100);
        // Crear cargo en Culqi
        const chargeResponse = await this.createCulqiCharge({
            amount: amountInCents,
            currency_code: 'PEN',
            email: data.email,
            source_id: data.culqiToken,
            description: `Recarga de billetera digital - S/. ${data.amount.toFixed(2)}`,
            metadata: { user_id: data.userId, type: 'wallet_recharge' },
        });
        if (chargeResponse.outcome?.type !== 'venta_exitosa') {
            throw new Error(`Recarga rechazada: ${chargeResponse.outcome?.user_message || 'Error desconocido'}`);
        }
        // Acreditar saldo al usuario
        const user = await this.userRepo.findOne({ where: { id: data.userId } });
        if (!user)
            throw new Error('Usuario no encontrado');
        user.balance = parseFloat((Number(user.balance) + data.amount).toFixed(2));
        await this.userRepo.save(user);
        logger_1.logger.info(`[Payment] Recarga exitosa: user=${data.userId} | amount=S/.${data.amount} | newBalance=S/.${user.balance}`);
        return {
            newBalance: user.balance,
            chargeId: chargeResponse.id,
            message: `Recarga de S/. ${data.amount.toFixed(2)} exitosa. Nuevo saldo: S/. ${user.balance.toFixed(2)}`,
        };
    }
    /**
     * Llamada real a la API de Culqi para crear un cargo.
     * En modo sandbox, usar la clave de prueba: sk_test_...
     */
    async createCulqiCharge(payload) {
        if (!CULQI_SECRET_KEY) {
            // Modo simulación para desarrollo sin clave Culqi
            logger_1.logger.warn('[Payment] CULQI_SECRET_KEY no configurada. Usando modo simulación.');
            return this.simulateCulqiCharge(payload);
        }
        const response = await fetch(`${CULQI_API_URL}/charges`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CULQI_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
            const errorMsg = data?.user_message || data?.merchant_message || 'Error en Culqi';
            throw new Error(errorMsg);
        }
        return data;
    }
    /**
     * Simulación de Culqi para entorno de desarrollo sin credenciales reales.
     * Simula un pago exitoso con datos ficticios.
     */
    simulateCulqiCharge(payload) {
        return {
            id: `ch_test_${Date.now()}`,
            object: 'charge',
            amount: payload.amount,
            currency_code: payload.currency_code,
            email: payload.email,
            outcome: {
                type: 'venta_exitosa',
                code: '000',
                merchant_message: 'La operación de venta ha sido autorizada exitosamente.',
                user_message: 'Su tarjeta ha sido cargada exitosamente.',
            },
            source: {
                id: payload.source_id,
                type: 'card',
                card_number: '411111XXXXXX1111',
                brand: 'Visa',
            },
        };
    }
}
exports.PaymentService = PaymentService;
//# sourceMappingURL=PaymentService.js.map