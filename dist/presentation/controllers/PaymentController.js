"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const PaymentService_1 = require("../../application/services/PaymentService");
const schemas_1 = require("../validators/schemas");
const router = (0, express_1.Router)();
const paymentService = new PaymentService_1.PaymentService();
// ─── Schemas de validación ────────────────────────────────────────────────────
const CardPaymentSchema = zod_1.z.object({
    bookingId: zod_1.z.string().uuid('bookingId debe ser un UUID válido'),
    culqiToken: zod_1.z.string().min(1, 'Se requiere el token de Culqi generado por Culqi.js'),
});
const WalletPaymentSchema = zod_1.z.object({
    bookingId: zod_1.z.string().uuid('bookingId debe ser un UUID válido'),
});
const WalletRechargeSchema = zod_1.z.object({
    amount: zod_1.z
        .number()
        .min(10, 'El monto mínimo de recarga es S/. 10.00')
        .max(1000, 'El monto máximo de recarga es S/. 1,000.00'),
    culqiToken: zod_1.z.string().min(1, 'Se requiere el token de Culqi'),
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
router.post('/card', (0, schemas_1.validateBody)(CardPaymentSchema), async (req, res, next) => {
    try {
        const { bookingId, culqiToken } = req.body;
        const userId = req.user.sub;
        const email = req.user.email;
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
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        if (error.message?.includes('ya fue pagada'))
            return res.status(409).json({ error: error.message });
        if (error.message?.includes('permisos'))
            return res.status(403).json({ error: error.message });
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
router.post('/wallet', (0, schemas_1.validateBody)(WalletPaymentSchema), async (req, res, next) => {
    try {
        const { bookingId } = req.body;
        const userId = req.user.sub;
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
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        if (error.message?.includes('ya fue pagada'))
            return res.status(409).json({ error: error.message });
        if (error.message?.includes('permisos'))
            return res.status(403).json({ error: error.message });
        if (error.message?.includes('Saldo insuficiente'))
            return res.status(402).json({ error: error.message });
        next(error);
    }
});
/**
 * POST /api/v1/payments/wallet/recharge
 * Recargar saldo en la billetera digital del usuario via Culqi.
 *
 * Mínimo: S/. 10.00 | Máximo: S/. 1,000.00
 */
router.post('/wallet/recharge', (0, schemas_1.validateBody)(WalletRechargeSchema), async (req, res, next) => {
    try {
        const { amount, culqiToken } = req.body;
        const userId = req.user.sub;
        const email = req.user.email;
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
    }
    catch (error) {
        if (error.message?.includes('rechazada') || error.message?.includes('Culqi')) {
            return res.status(402).json({ error: error.message });
        }
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=PaymentController.js.map