"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const BookingService_1 = require("../../application/services/BookingService");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const MockPaymentAdapter_1 = require("../../infrastructure/payments/MockPaymentAdapter");
const router = (0, express_1.Router)();
const bookingService = new BookingService_1.BookingService();
const paymentAdapter = new MockPaymentAdapter_1.MockPaymentAdapter();
/**
 * POST /api/v1/bookings
 * Crea una reserva al contado para un asiento específico en un viaje.
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN o DRIVER en mostrador)
 * Body: { tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId }
 */
router.post('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId, } = req.body;
        // Validación básica de campos requeridos
        if (!tripId || !passengerName || !passengerDocType || !passengerDocNum || !startWaypointId || !endWaypointId || !seatId) {
            return res.status(400).json({
                error: 'Todos los campos son requeridos: tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId',
            });
        }
        // Pasar el userId del usuario autenticado para trazabilidad
        const booking = await bookingService.createCashBooking({
            tripId,
            passengerName,
            passengerDocType,
            passengerDocNum,
            startWaypointId,
            endWaypointId,
            seatId,
            userId: req.user?.sub,
        });
        return res.status(201).json({
            message: 'Reserva creada exitosamente',
            booking: {
                id: booking.id,
                seatId: booking.seatId,
                totalPrice: booking.totalPrice,
                paymentStatus: booking.paymentStatus,
                createdAt: booking.createdAt,
            },
        });
    }
    catch (error) {
        if (error.message?.includes('ocupado')) {
            return res.status(409).json({ error: error.message });
        }
        if (error.message && (error.message.includes('no encontrado') || error.message.includes('inválidos') || error.message.includes('ilógico'))) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});
/**
 * POST /api/v1/bookings/digital
 * Crea una reserva digital y cobra instantáneamente (Tarjeta, Yape, Plin).
 * ✅ REQUIERE autenticación
 */
router.post('/digital', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId, paymentDetails, // { method, token, phoneNumber }
         } = req.body;
        if (!tripId || !passengerName || !passengerDocType || !passengerDocNum || !startWaypointId || !endWaypointId || !seatId || !paymentDetails?.method) {
            return res.status(400).json({
                error: 'Faltan campos requeridos incluyendo paymentDetails con el método.',
            });
        }
        const booking = await bookingService.createDigitalBooking({
            tripId,
            passengerName,
            passengerDocType,
            passengerDocNum,
            startWaypointId,
            endWaypointId,
            seatId,
            userId: req.user?.sub,
        }, paymentAdapter, paymentDetails);
        return res.status(201).json({
            message: 'Pago procesado y reserva creada exitosamente',
            booking: {
                id: booking.id,
                seatId: booking.seatId,
                totalPrice: booking.totalPrice,
                paymentStatus: booking.paymentStatus,
                paymentMethod: booking.paymentMethod,
                transactionRef: booking.paymentGatewayRef,
                createdAt: booking.createdAt,
            },
        });
    }
    catch (error) {
        if (error.message?.includes('ocupado')) {
            return res.status(409).json({ error: error.message });
        }
        if (error.message?.includes('Pago rechazado')) {
            return res.status(402).json({ error: error.message });
        }
        if (error.message && (error.message.includes('no encontrado') || error.message.includes('inválidos') || error.message.includes('ilógico'))) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});
/**
 * GET /api/v1/bookings/my
 * Obtiene las reservas del usuario autenticado.
 * ✅ REQUIERE autenticación (aplicada a nivel de router en app.ts)
 */
router.get('/my', async (req, res, next) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const result = await bookingService.getMyBookings(userId, page, limit);
        return res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=BookingController.js.map