import { Router, Request, Response, NextFunction } from 'express';
import { BookingService } from '../application/BookingService';
import { authenticate } from '../../../presentation/middlewares/auth.middleware';
import { MockPaymentAdapter } from '../../payments/infrastructure/MockPaymentAdapter';
import { AuditLogService } from '../../../application/services/AuditLogService';
import { validateBody, CreateBookingSchema, CreateDigitalBookingSchema } from '../../../presentation/validators/schemas';
import { AppDataSource } from '../../../infrastructure/database/data-source';
import { UserEntity } from '../../../infrastructure/database/entities/UserEntity';
import { BookingEntity } from '../domain/BookingEntity';
import { ParcelEntity } from '../../parcels/domain/ParcelEntity';


const router = Router();
const bookingService = new BookingService();
const paymentAdapter = new MockPaymentAdapter();

/**
 * POST /api/v1/bookings
 * Crea una reserva al contado para un asiento específico en un viaje.
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN o DRIVER en mostrador)
 * Body: { tripId, passengerName, passengerDocType, passengerDocNum, startWaypointId, endWaypointId, seatId }
 */
router.post('/', authenticate, validateBody(CreateBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
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
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
        });

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_CASH_BOOKING',
            entityName: 'BookingEntity',
            entityId: booking.id,
            newValue: { tripId, passengerName, seatId, totalPrice: booking.totalPrice, paymentStatus: booking.paymentStatus },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
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
        if (error.message?.includes('otra empresa')) {
            return res.status(403).json({ error: error.message });
        }
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
router.post('/digital', authenticate, validateBody(CreateDigitalBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            tripId,
            passengerName,
            passengerDocType,
            passengerDocNum,
            startWaypointId,
            endWaypointId,
            seatId,
            paymentDetails, // { method, token, phoneNumber }
        } = req.body;

        const booking = await bookingService.createDigitalBooking(
            {
                tripId,
                passengerName,
                passengerDocType,
                passengerDocNum,
                startWaypointId,
                endWaypointId,
                seatId,
                userId: req.user?.sub,
                actorRole: req.user?.role,
                actorCompanyId: req.user?.companyId,
            },
            paymentAdapter,
            paymentDetails
        );

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_DIGITAL_BOOKING',
            entityName: 'BookingEntity',
            entityId: booking.id,
            newValue: { tripId, passengerName, seatId, totalPrice: booking.totalPrice, paymentStatus: booking.paymentStatus, paymentMethod: booking.paymentMethod },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

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
        if (error.message?.includes('otra empresa')) {
            return res.status(403).json({ error: error.message });
        }
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
 * GET /api/v1/bookings/passenger/lookup
 * Busca un pasajero por su tipo y número de documento (DNI o RUC).
 * Prioriza la búsqueda local en PostgreSQL (UserEntity, BookingEntity, ParcelEntity).
 * Si no lo encuentra, consulta el API externo (apisperu).
 * ✅ REQUIERE autenticación
 */
router.get('/passenger/lookup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { docType, docNum } = req.query;
        if (!docType || !docNum) {
            return res.status(400).json({ error: 'Faltan parámetros docType o docNum.' });
        }

        const docTypeStr = String(docType).toUpperCase();
        const docNumStr = String(docNum).trim();

        // 1. Buscar en la Base de Datos Local
        // A. Buscar en Tabla de Usuarios (users)
        const userRepo = AppDataSource.getRepository(UserEntity);
        const localUser = await userRepo.findOne({
            where: { docNum: docNumStr, docType: docTypeStr }
        });

        if (localUser) {
            return res.status(200).json({
                source: 'local_database',
                name: localUser.name,
                phone: localUser.phone || '',
            });
        }

        // B. Buscar en Reservas Previas (bookings)
        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const localBooking = await bookingRepo.findOne({
            where: { passengerDocNum: docNumStr, passengerDocType: docTypeStr },
            order: { createdAt: 'DESC' }
        });

        if (localBooking) {
            return res.status(200).json({
                source: 'local_database',
                name: localBooking.passengerName,
                phone: '',
            });
        }

        // C. Buscar en Encomiendas Previas (parcels)
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);
        const localParcelSender = await parcelRepo.findOne({
            where: { senderDoc: docNumStr },
            order: { createdAt: 'DESC' }
        });

        if (localParcelSender) {
            return res.status(200).json({
                source: 'local_database',
                name: localParcelSender.senderName,
                phone: '',
            });
        }

        const localParcelReceiver = await parcelRepo.findOne({
            where: { receiverDoc: docNumStr },
            order: { createdAt: 'DESC' }
        });

        if (localParcelReceiver) {
            return res.status(200).json({
                source: 'local_database',
                name: localParcelReceiver.receiverName,
                phone: '',
            });
        }

        // 2. Buscar en API externa (apisperu) si no se encontró localmente
        const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFrYWxscGEuc2FjQGdtYWlsLmNvbSJ9.kyTC7ka84weV9PqA3n4nDV8y2i4cc4EFgESWgADdp4o';

        if (docTypeStr === 'DNI' && docNumStr.length === 8) {
            const url = `https://dniruc.apisperu.com/api/v1/dni/${docNumStr}?token=${token}`;
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data: any = await response.json();
                    if (data.nombres) {
                        const fullName = [data.nombres, data.apellidoPaterno, data.apellidoMaterno]
                            .filter(Boolean)
                            .join(' ')
                            .trim();
                        return res.status(200).json({
                            source: 'apis_peru',
                            name: fullName,
                            phone: '',
                        });
                    }
                }
            } catch (apiErr) {
                console.error('Error llamando a apisperu DNI:', apiErr);
            }
        } else if (docTypeStr === 'RUC' && docNumStr.length === 11) {
            const url = `https://dniruc.apisperu.com/api/v1/ruc/${docNumStr}?token=${token}`;
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data: any = await response.json();
                    const name = data.razonSocial || data.nombre || data.nombreOrazonSocial;
                    if (name) {
                        return res.status(200).json({
                            source: 'apis_peru',
                            name: name.trim(),
                            phone: '',
                        });
                    }
                }
            } catch (apiErr) {
                console.error('Error llamando a apisperu RUC:', apiErr);
            }
        }

        // Si no se encuentra en ningún lado, se devuelve éxito con campos vacíos
        return res.status(200).json({
            source: 'not_found',
            name: '',
            phone: '',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/bookings/my
 * Obtiene las reservas del usuario autenticado.
 * ✅ REQUIERE autenticación (aplicada a nivel de router en app.ts)
 */
router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const result = await bookingService.getMyBookings(userId, page, limit);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/v1/bookings/:id/cancel
 * Cancelar una reserva existente
 * ✅ REQUIERE autenticación
 */
router.patch('/:id/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const booking = await bookingService.cancelBooking(id, req.user?.sub, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CANCEL_BOOKING',
            entityName: 'BookingEntity',
            entityId: id,
            newValue: { paymentStatus: booking.paymentStatus },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({ message: 'Reserva cancelada exitosamente', booking });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('No tienes permisos')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('No se puede cancelar')) return res.status(400).json({ error: error.message });
        next(error);
    }
});

export default router;


