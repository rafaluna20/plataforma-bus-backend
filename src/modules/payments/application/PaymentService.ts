import { AppDataSource } from '../../../infrastructure/database/data-source';
import { BookingEntity, PaymentStatus } from '../../bookings/domain/BookingEntity';
import { UserEntity } from '../../../infrastructure/database/entities/UserEntity';
import { logger } from '../../../infrastructure/logger';

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

export interface CulqiChargeRequest {
    amount: number;          // En centavos (ej: S/. 50.00 = 5000)
    currency_code: string;   // 'PEN' para soles peruanos
    email: string;
    source_id: string;       // Token de tarjeta generado por Culqi.js
    description?: string;
    metadata?: Record<string, string>;
}

export interface CulqiChargeResponse {
    id: string;
    object: string;
    amount: number;
    currency_code: string;
    email: string;
    outcome: {
        type: string;        // 'venta_exitosa' si fue exitoso
        code: string;
        merchant_message: string;
        user_message: string;
    };
    source: {
        id: string;
        type: string;        // 'card'
        card_number: string; // Últimos 4 dígitos
        brand: string;       // 'Visa', 'Mastercard', etc.
    };
}

export interface ProcessPaymentDTO {
    bookingId: string;
    userId: string;
    culqiToken: string;      // Token generado por Culqi.js en el frontend
    email: string;
}

export interface WalletPaymentDTO {
    bookingId: string;
    userId: string;
}

export class PaymentService {
    private get bookingRepo() {
        return AppDataSource.getRepository(BookingEntity);
    }

    private get userRepo() {
        return AppDataSource.getRepository(UserEntity);
    }

    /**
     * Procesar pago con tarjeta de crédito/débito via Culqi.
     * El frontend debe tokenizar la tarjeta con Culqi.js primero.
     */
    public async processCardPayment(data: ProcessPaymentDTO): Promise<{
        success: boolean;
        chargeId: string;
        message: string;
        booking: BookingEntity;
    }> {
        // 1. Obtener la reserva y validar que esté pendiente
        const booking = await this.bookingRepo.findOne({
            where: { id: data.bookingId },
            relations: { user: true, trip: true },
        });

        if (!booking) throw new Error('Reserva no encontrada');
        if (booking.user.id !== data.userId) throw new Error('No tienes permisos para pagar esta reserva');
        if (booking.paymentStatus === PaymentStatus.PAID || booking.paymentStatus === PaymentStatus.PAID_DIGITAL) {
            throw new Error('Esta reserva ya fue pagada');
        }

        // 2. Calcular monto en centavos (Culqi trabaja en centavos)
        const amountInCents = Math.round(booking.price * 100);

        // 3. Crear cargo en Culqi
        const chargePayload: CulqiChargeRequest = {
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

        let chargeResponse: CulqiChargeResponse;

        try {
            chargeResponse = await this.createCulqiCharge(chargePayload);
        } catch (error: any) {
            logger.error(`[Payment] Error al procesar cargo Culqi: ${error.message}`, {
                bookingId: data.bookingId,
                amount: amountInCents,
            });
            throw new Error(`Error al procesar el pago: ${error.message}`);
        }

        // 4. Verificar que el cargo fue exitoso
        if (chargeResponse.outcome?.type !== 'venta_exitosa') {
            const userMessage = chargeResponse.outcome?.user_message || 'Pago rechazado';
            logger.warn(`[Payment] Cargo rechazado: ${userMessage}`, { bookingId: data.bookingId });
            throw new Error(`Pago rechazado: ${userMessage}`);
        }

        // 5. Actualizar estado de la reserva
        booking.paymentStatus = PaymentStatus.PAID;
        booking.culqiChargeId = chargeResponse.id;
        const savedBooking = await this.bookingRepo.save(booking);

        logger.info(`[Payment] Pago exitoso: booking=${data.bookingId} | charge=${chargeResponse.id} | amount=S/.${booking.price}`);

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
    public async processWalletPayment(data: WalletPaymentDTO): Promise<{
        success: boolean;
        newBalance: number;
        message: string;
        booking: BookingEntity;
    }> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Obtener reserva y usuario con bloqueo para evitar race conditions
            const booking = await queryRunner.manager.findOne(BookingEntity, {
                where: { id: data.bookingId },
                relations: { user: true },
                lock: { mode: 'pessimistic_write' },
            });

            if (!booking) throw new Error('Reserva no encontrada');
            if (booking.user.id !== data.userId) throw new Error('No tienes permisos para pagar esta reserva');
            if (booking.paymentStatus === PaymentStatus.PAID || booking.paymentStatus === PaymentStatus.PAID_DIGITAL) {
                throw new Error('Esta reserva ya fue pagada');
            }

            const user = await queryRunner.manager.findOne(UserEntity, {
                where: { id: data.userId },
                lock: { mode: 'pessimistic_write' },
            });

            if (!user) throw new Error('Usuario no encontrado');

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
            booking.paymentStatus = PaymentStatus.PAID_DIGITAL;
            const savedBooking = await queryRunner.manager.save(booking);

            await queryRunner.commitTransaction();

            logger.info(`[Payment] Pago con billetera: booking=${data.bookingId} | user=${data.userId} | amount=S/.${price} | newBalance=S/.${user.balance}`);

            return {
                success: true,
                newBalance: user.balance,
                message: `Pago de S/. ${price.toFixed(2)} realizado con tu billetera. Saldo restante: S/. ${user.balance.toFixed(2)}`,
                booking: savedBooking,
            };

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Recargar saldo en la billetera digital del usuario via Culqi.
     */
    public async rechargeWallet(data: {
        userId: string;
        amount: number;       // En soles (ej: 50.00)
        culqiToken: string;
        email: string;
    }): Promise<{ newBalance: number; chargeId: string; message: string }> {
        if (data.amount < 10) throw new Error('El monto mínimo de recarga es S/. 10.00');
        if (data.amount > 1000) throw new Error('El monto máximo de recarga es S/. 1,000.00');

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
        if (!user) throw new Error('Usuario no encontrado');

        user.balance = parseFloat((Number(user.balance) + data.amount).toFixed(2));
        await this.userRepo.save(user);

        logger.info(`[Payment] Recarga exitosa: user=${data.userId} | amount=S/.${data.amount} | newBalance=S/.${user.balance}`);

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
    private async createCulqiCharge(payload: CulqiChargeRequest): Promise<CulqiChargeResponse> {
        if (!CULQI_SECRET_KEY) {
            // Modo simulación para desarrollo sin clave Culqi
            logger.warn('[Payment] CULQI_SECRET_KEY no configurada. Usando modo simulación.');
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

        const data = await response.json() as any;

        if (!response.ok) {
            const errorMsg = data?.user_message || data?.merchant_message || 'Error en Culqi';
            throw new Error(errorMsg);
        }

        return data as CulqiChargeResponse;
    }

    /**
     * Simulación de Culqi para entorno de desarrollo sin credenciales reales.
     * Simula un pago exitoso con datos ficticios.
     */
    private simulateCulqiCharge(payload: CulqiChargeRequest): CulqiChargeResponse {
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
