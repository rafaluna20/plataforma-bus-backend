import { Router, Request, Response, NextFunction } from 'express';
import { BookingService } from '../../application/services/BookingService';

const router = Router();
const bookingService = new BookingService();

/**
 * POST /api/v1/bookings
 * Crea una reserva al contado para un asiento específico en un viaje.
 * Body: { tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId }
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            tripId,
            passengerName,
            passengerDocType,
            passengerDocNum,
            startWaypointId,
            endWaypointId,
            seatId,
        } = req.body;

        // Validación básica de campos requeridos
        if (!tripId || !passengerName || !passengerDocType || !passengerDocNum || !startWaypointId || !endWaypointId || !seatId) {
            return res.status(400).json({
                error: 'Todos los campos son requeridos: tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId',
            });
        }

        const booking = await bookingService.createCashBooking({
            tripId,
            passengerName,
            passengerDocType,
            passengerDocNum,
            startWaypointId,
            endWaypointId,
            seatId,
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
    } catch (error: any) {
        // Manejar errores de negocio (Ej. asiento ocupado) con 409 Conflict
        if (error.message && error.message.includes('ocupado')) {
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
 */
import { MockPaymentAdapter } from '../../infrastructure/payments/MockPaymentAdapter';
const paymentAdapter = new MockPaymentAdapter();

router.post('/digital', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            tripId,
            passengerName,
            passengerDocType,
            passengerDocNum,
            startWaypointId,
            endWaypointId,
            seatId,
            paymentDetails // { method, token, phoneNumber }
        } = req.body;

        if (!tripId || !passengerName || !passengerDocType || !passengerDocNum || !startWaypointId || !endWaypointId || !seatId || !paymentDetails || !paymentDetails.method) {
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
    } catch (error: any) {
        if (error.message && error.message.includes('ocupado')) {
            return res.status(409).json({ error: error.message });
        }
        if (error.message && error.message.includes('Pago rechazado')) {
            return res.status(402).json({ error: error.message }); // 402 Payment Required
        }
        if (error.message && (error.message.includes('no encontrado') || error.message.includes('inválidos') || error.message.includes('ilógico'))) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

export default router;
