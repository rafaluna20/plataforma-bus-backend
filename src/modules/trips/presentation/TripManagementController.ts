import { Router, Request, Response, NextFunction } from 'express';
import { TripManagementService } from '../application/TripManagementService';
import { authorize } from '../../../presentation/middlewares/auth.middleware';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';

const router = Router();
const tripMgmtService = new TripManagementService();

/**
 * POST /api/v1/management/trips
 * Programar una nueva salida/viaje
 * Restringido a ADMIN/SUPER_ADMIN/DRIVER (AGENCY_SELLER solo autoriza abordaje, no crea viajes)
 */
router.post('/', authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { routeId, vehicleId, departureTime, driverId } = req.body;

        if (!routeId || !vehicleId || !departureTime) {
            return res.status(400).json({ error: 'Campos requeridos: routeId, vehicleId, departureTime' });
        }

        const trip = await tripMgmtService.create({
            routeId,
            vehicleId,
            departureTime: new Date(departureTime),
            driverId: driverId || undefined,
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
        });
        return res.status(201).json({ message: 'Viaje programado exitosamente', trip });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('misma empresa')) return res.status(400).json({ error: error.message });
        if (error.message?.includes('ya tiene un viaje')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('programado')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrad')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('futuro') || error.message?.includes('fecha')) return res.status(400).json({ error: error.message });
        if (error.message?.includes('inactivo')) return res.status(400).json({ error: error.message });
        // Para cualquier otro error de negocio, devolver 400 con el mensaje real
        if (error.message) return res.status(400).json({ error: error.message });
        next(error);
    }
});

/**
 * PATCH /api/v1/management/trips/:id
 * Editar/Reprogramar un viaje (cambiar salida o vehículo)
 * Restringido a ADMIN/SUPER_ADMIN/DRIVER (AGENCY_SELLER no reprograma viajes)
 */
router.patch('/:id', authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { departureTime, vehicleId, driverId } = req.body;
        const tripId = req.params.id as string;

        if (departureTime === undefined && vehicleId === undefined && driverId === undefined) {
            return res.status(400).json({ error: 'Debe proveer al menos uno de: departureTime, vehicleId, driverId' });
        }

        const trip = await tripMgmtService.update(tripId, {
            departureTime: departureTime ? new Date(departureTime) : undefined,
            vehicleId,
            driverId, // undefined = no tocar; null o '' = quitar conductor; uuid = asignar
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
        });

        return res.status(200).json({ message: 'Viaje reprogramado exitosamente', trip });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ya tiene un viaje')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('programado') || error.message?.includes('conflicto')) return res.status(409).json({ error: error.message });
        if (error.message) return res.status(400).json({ error: error.message });
        next(error);
    }
});

/**
 * PATCH /api/v1/management/trips/:id/status
 * Actualizar el estado de un viaje (SCHEDULED → BOARDING → IN_TRANSIT → COMPLETED)
 * Abierto a ADMIN/SUPER_ADMIN/DRIVER/AGENCY_SELLER: el vendedor puede autorizar el
 * abordaje (SCHEDULED→BOARDING→IN_TRANSIT), pero solo conductor/admin puede marcar
 * COMPLETED (confirmar llegada) — esa regla fina se valida en el service según el rol.
 */
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Campo requerido: status' });

        const tripId = req.params.id as string;
        const trip = await tripMgmtService.updateStatus({
            tripId,
            status,
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
        });
        return res.status(200).json({ message: `Estado actualizado a ${status}`, trip });
    } catch (error: any) {
        if (error.message?.includes('No se puede cambiar')) return res.status(400).json({ error: error.message });
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no está autorizado')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/management/trips/company/:companyId
 * Listar viajes de una empresa (opcionalmente filtrar por estado con ?status=SCHEDULED)
 * Restringido a ADMIN/SUPER_ADMIN/DRIVER
 */
router.get('/company/:companyId', authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.query;
        const companyId = req.params.companyId as string;
        const result = await tripMgmtService.findByCompany(
            companyId,
            status as any,
            {},
            req.user?.role,
            req.user?.companyId,
        );
        return res.status(200).json({ count: result.total, trips: result.data, page: result.page, totalPages: result.totalPages });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/management/trips/my-driver
 * Viajes activos asignados al conductor autenticado (para su panel).
 * DEBE declararse antes de la ruta '/:id' para no ser capturada por el param.
 */
router.get('/my-driver', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const driverId = req.user?.sub;
        if (!driverId) return res.status(401).json({ error: 'No autenticado' });

        const trips = await tripMgmtService.findByDriver(driverId);
        return res.status(200).json({ count: trips.length, trips });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/management/trips/:id
 * Obtener detalle completo de un viaje (ruta, waypoints, vehículo)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const trip = await tripMgmtService.findById(id, req.user?.role, req.user?.companyId);
        return res.status(200).json(trip);
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/management/trips/:id/manifest
 * Obtener el manifiesto de pasajeros de un viaje
 */
router.get('/:id/manifest', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const manifest = await tripMgmtService.getPassengerManifest(id, req.user?.role, req.user?.companyId);
        return res.status(200).json({ count: manifest.length, passengers: manifest });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

export default router;
