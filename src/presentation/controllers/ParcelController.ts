import { Router, Request, Response, NextFunction } from 'express';
import { ParcelService, CreateParcelDTO } from '../../application/services/ParcelService';
import { ParcelStatus } from '../../infrastructure/database/entities/ParcelEntity';
import { AuditLogService } from '../../application/services/AuditLogService';

const router = Router();
const parcelService = new ParcelService();

/**
 * POST /api/v1/parcels
 * Registrar una nueva encomienda en un viaje.
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN)
 * Body: { tripId, senderName, senderDoc, receiverName, receiverDoc,
 *         startWaypointId, endWaypointId, description?, weightKg?, totalPrice, paymentMethod? }
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            tripId,
            senderName,
            senderDoc,
            receiverName,
            receiverDoc,
            startWaypointId,
            endWaypointId,
            description,
            weightKg,
            totalPrice,
            paymentMethod,
        } = req.body;

        // Validación de campos requeridos
        if (!tripId || !senderName || !senderDoc || !receiverName || !receiverDoc || !startWaypointId || !endWaypointId || !totalPrice) {
            return res.status(400).json({
                error: 'Campos requeridos: tripId, senderName, senderDoc, receiverName, receiverDoc, startWaypointId, endWaypointId, totalPrice',
            });
        }

        const dto: CreateParcelDTO = {
            tripId,
            senderName:     senderName.trim(),
            senderDoc:      senderDoc.trim(),
            receiverName:   receiverName.trim(),
            receiverDoc:    receiverDoc.trim(),
            startWaypointId,
            endWaypointId,
            description:    description?.trim(),
            weightKg:       weightKg ? parseFloat(weightKg) : undefined,
            totalPrice:     parseFloat(totalPrice),
            paymentMethod,
            sellerId:       req.user?.sub,   // Vendedor autenticado
        };

        const parcel = await parcelService.createParcel(dto);

        // Auditoría
        await AuditLogService.log({
            userId:    req.user?.sub,
            userEmail: req.user?.email,
            action:    'CREATE_PARCEL',
            entityName: 'ParcelEntity',
            entityId:   parcel.id,
            newValue: {
                tripId,
                senderName,
                receiverName,
                totalPrice: parcel.totalPrice,
                status:     parcel.status,
                paymentStatus: parcel.paymentStatus,
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(201).json({
            message: 'Encomienda registrada exitosamente',
            parcel,
        });
    } catch (error: any) {
        if (error.message?.includes('no encontrado') || error.message?.includes('inválido') || error.message?.includes('origen')) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * GET /api/v1/parcels/trip/:tripId
 * Obtener todas las encomiendas de un viaje.
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN)
 */
router.get('/trip/:tripId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tripId = req.params.tripId as string;
        if (!tripId) return res.status(400).json({ error: 'tripId es requerido' });

        const parcels = await parcelService.getParcelsByTrip(tripId);

        return res.status(200).json({
            parcels,
            total: parcels.length,
        });
    } catch (error: any) {
        next(error);
    }
});

/**
 * GET /api/v1/parcels/:id
 * Obtener una encomienda por ID.
 * ✅ REQUIERE autenticación
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parcel = await parcelService.getParcelById(req.params.id as string);
        return res.status(200).json({ parcel });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/parcels/:id/status
 * Actualizar el estado de una encomienda (tracking).
 * Body: { status: 'RECEIVED' | 'IN_TRANSIT' | 'READY_FOR_PICKUP' | 'DELIVERED' }
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN)
 */
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;

        const validStatuses = Object.values(ParcelStatus);
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}`,
            });
        }

        const parcel = await parcelService.updateParcelStatus(req.params.id as string, { status });

        // Auditoría
        await AuditLogService.log({
            userId:    req.user?.sub,
            userEmail: req.user?.email,
            action:    'UPDATE_PARCEL_STATUS',
            entityName: 'ParcelEntity',
            entityId:   parcel.id,
            newValue:  { status: parcel.status },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({
            message: `Estado actualizado a: ${parcel.status}`,
            parcel,
        });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});

export default router;
