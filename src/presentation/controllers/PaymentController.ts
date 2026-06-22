import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentService } from '../../application/services/PaymentService';
import { validateBody } from '../validators/schemas';

const router = Router();
const paymentService = new PaymentService();

// ─── Schemas de validación ────────────────────────────────────────────────────

const CardPaymentSchema = z.object({
    bookingId: z.string().uuid('bookingId debe ser un UUID válido'),
    culqiToken: z.string().min(1, 'Se requiere el token de Culqi generado por Culqi.js'),
});

const WalletPaymentSchema = z.object({
    bookingId: z.string().uuid('bookingId debe ser un UUID válido'),
});

const WalletRechargeSchema = z.object({
    amount: z
        .number()
        .min(10, 'El monto mínimo de recarga es S/. 10.00')
        .max(1000, 'El monto máximo de recarga es S/. 1,000.00'),
    culqiToken: z.string().min(1, 'Se requiere el token de Culqi'),
});

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/payments/card
 * Pagar una reserva con tarjeta de crédito/débito via Culqi.
 * 
 * Flujo:
 * 1. El frontend usa Culqi.js para tokenizar la tarjeta → obtiene culqiToken
 * 2. Envía el token al backend (NUNCA los datos de la tarjeta directamente)
 * 3. El backend crea el cargo en Culqi y actualiza la reserva
 */
router.post('/card', validateBody(CardPaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { bookingId, culqiToken } = req.body;
        const userId = req.user!.sub;
        const email = req.user!.email;

        const result = await paymentService.processCardPayment({
            bookingId,
            userId,
            culqiToken,
            email,
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            chargeId: result.chargeId,
            booking: {
                id: result.booking.id,
                paymentStatus: result.booking.paymentStatus,
                passengerName: result.booking.passengerName,
                seatId: result.booking.seatId,
            },
        });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ya fue pagada')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('permisos')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('rechazado') || error.message?.includes('Culqi')) {
            return res.status(402).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * POST /api/v1/payments/wallet
 * Pagar una reserva usando el saldo de la billetera digital.
 * Usa transacción con bloqueo pesimista para evitar doble gasto.
 */
router.post('/wallet', validateBody(WalletPaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { bookingId } = req.body;
        const userId = req.user!.sub;

        const result = await paymentService.processWalletPayment({ bookingId, userId });

        return res.status(200).json({
            success: true,
            message: result.message,
            newBalance: result.newBalance,
            booking: {
                id: result.booking.id,
                paymentStatus: result.booking.paymentStatus,
                passengerName: result.booking.passengerName,
                seatId: result.booking.seatId,
            },
        });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ya fue pagada')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('permisos')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('Saldo insuficiente')) return res.status(402).json({ error: error.message });
        next(error);
    }
});

/**
 * POST /api/v1/payments/wallet/recharge
 * Recargar saldo en la billetera digital del usuario via Culqi.
 * 
 * Mínimo: S/. 10.00 | Máximo: S/. 1,000.00
 */
router.post('/wallet/recharge', validateBody(WalletRechargeSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, culqiToken } = req.body;
        const userId = req.user!.sub;
        const email = req.user!.email;

        const result = await paymentService.rechargeWallet({
            userId,
            amount,
            culqiToken,
            email,
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            newBalance: result.newBalance,
            chargeId: result.chargeId,
        });
    } catch (error: any) {
        if (error.message?.includes('rechazada') || error.message?.includes('Culqi')) {
            return res.status(402).json({ error: error.message });
        }
        next(error);
    }
});

export default router;
