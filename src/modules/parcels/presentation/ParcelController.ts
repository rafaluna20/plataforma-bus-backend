import { Router, Request, Response, NextFunction } from 'express';
import { ParcelService, CreateParcelDTO } from '../application/ParcelService';
import { AuditLogService } from '../../../application/services/AuditLogService';
import {
    validateBody, validateQuery,
    CreateParcelSchema, UpdateParcelStatusSchema, ReassignParcelSchema, PendingParcelsQuerySchema,
} from '../../../presentation/validators/schemas';

const router = Router();
const parcelService = new ParcelService();

/**
 * POST /api/v1/parcels
 * Registrar una nueva encomienda. Con tripId queda asignada a ese viaje; sin
 * tripId (y con companyId) queda "pendiente de asignar" en la bandeja.
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN, AGENCY_SELLER)
 * Body: { tripId?, companyId?, senderName, senderDoc, receiverName, receiverDoc,
 *         startWaypointId, endWaypointId, description?, weightKg?, totalPrice, paymentMethod? }
 */
router.post('/', validateBody(CreateParcelSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            tripId,
            companyId,
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

        const dto: CreateParcelDTO = {
            tripId,
            companyId,
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
            actorRole:      req.user?.role,
            actorCompanyId: req.user?.companyId,
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
                tripId: tripId ?? null,
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
            message: tripId ? 'Encomienda registrada exitosamente' : 'Encomienda registrada en la bandeja (pendiente de asignar)',
            parcel,
        });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado') || error.message?.includes('inválido') || error.message?.includes('origen') || error.message?.includes('ruta')) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * GET /api/v1/parcels/pending
 * Bandeja de encomiendas "pendientes de asignar" (sin viaje) de una empresa.
 * Query: ?companyId=uuid&startWaypointId=uuid&endWaypointId=uuid
 * ✅ REQUIERE autenticación
 * IMPORTANTE: debe ir ANTES de GET /:id para que Express no lo capture como un ID.
 */
router.get('/pending', validateQuery(PendingParcelsQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = (req as any).validatedQuery;
        const parcels = await parcelService.getPendingParcels(
            query.companyId,
            { startWaypointId: query.startWaypointId, endWaypointId: query.endWaypointId },
            req.user?.role,
            req.user?.companyId,
        );
        return res.status(200).json({ parcels, total: parcels.length });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
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

        const parcels = await parcelService.getParcelsByTrip(tripId, req.user?.role, req.user?.companyId);

        return res.status(200).json({
            parcels,
            total: parcels.length,
        });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
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
        const parcel = await parcelService.getParcelById(req.params.id as string, req.user?.role, req.user?.companyId);
        return res.status(200).json({ parcel });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
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
router.patch('/:id/status', validateBody(UpdateParcelStatusSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;

        const parcel = await parcelService.updateParcelStatus(
            req.params.id as string,
            { status },
            req.user?.role,
            req.user?.companyId,
        );

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
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrada')) {
            return res.status(404).json({ error: error.message });
        }
        if (error.message?.includes('asignar un viaje')) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/parcels/:id/reassign
 * Asignar, reasignar o "desasignar" (volver a la bandeja) una encomienda.
 * Body: { tripId: string | null } — null = quitar del viaje actual (vuelve a la bandeja).
 * ✅ REQUIERE autenticación (ADMIN, SUPER_ADMIN, AGENCY_SELLER)
 */
router.patch('/:id/reassign', validateBody(ReassignParcelSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.body as { tripId: string | null };

        const parcel = await parcelService.reassignParcel(
            req.params.id as string,
            tripId,
            req.user?.role,
            req.user?.companyId,
        );

        // Auditoría
        await AuditLogService.log({
            userId:    req.user?.sub,
            userEmail: req.user?.email,
            action:    'REASSIGN_PARCEL',
            entityName: 'ParcelEntity',
            entityId:   parcel.id,
            newValue:  { tripId: tripId ?? null },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({
            message: tripId ? 'Encomienda reasignada exitosamente' : 'Encomienda enviada a la bandeja (sin viaje asignado)',
            parcel,
        });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado') || error.message?.includes('no encontrada')) {
            return res.status(404).json({ error: error.message });
        }
        if (error.message?.includes('entregada o cancelada') || error.message?.includes('misma ruta')) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

export default router;
