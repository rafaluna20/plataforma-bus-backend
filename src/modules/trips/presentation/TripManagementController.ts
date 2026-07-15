import { Router, Request, Response, NextFunction } from 'express';
import { TripManagementService } from '../application/TripManagementService';
import { authorize } from '../../../presentation/middlewares/auth.middleware';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';
import { validateBody, CreateTripSchema, UpdateTripSchema, UpdateTripStatusSchema } from '../../../presentation/validators/schemas';
import { emitToTrip, setLastKnownLocation } from '../../../infrastructure/sockets/SocketBus';

const router = Router();
const tripMgmtService = new TripManagementService();

/**
 * POST /api/v1/management/trips
 * Programar una nueva salida/viaje
 * Restringido a ADMIN/SUPER_ADMIN/DRIVER (AGENCY_SELLER solo autoriza abordaje, no crea viajes)
 */
router.post('/', authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER), validateBody(CreateTripSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { routeId, vehicleId, departureTime, driverId, copilotName, copilotLicense, auxiliarName } = req.body;

        const trip = await tripMgmtService.create({
            routeId,
            vehicleId,
            departureTime: new Date(departureTime),
            driverId: driverId || undefined,
            copilotName,
            copilotLicense,
            auxiliarName,
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
router.patch('/:id', authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER), validateBody(UpdateTripSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { departureTime, vehicleId, driverId, copilotName, copilotLicense, auxiliarName } = req.body;
        const tripId = req.params.id as string;

        const trip = await tripMgmtService.update(tripId, {
            departureTime: departureTime ? new Date(departureTime) : undefined,
            vehicleId,
            driverId, // undefined = no tocar; null o '' = quitar conductor; uuid = asignar
            copilotName,
            copilotLicense,
            auxiliarName,
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
            actorId: req.user?.sub,
        });

        return res.status(200).json({ message: 'Viaje reprogramado exitosamente', trip });
    } catch (error: any) {
        if (error.message?.includes('otra empresa') || error.message?.includes('asignado a ti')) {
            return res.status(403).json({ error: error.message });
        }
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
router.patch('/:id/status', validateBody(UpdateTripStatusSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const tripId = req.params.id as string;
        const trip = await tripMgmtService.updateStatus({
            tripId,
            status,
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
            actorId: req.user?.sub,
        });
        return res.status(200).json({ message: `Estado actualizado a ${status}`, trip });
    } catch (error: any) {
        if (error.message?.includes('No se puede cambiar')) return res.status(400).json({ error: error.message });
        if (error.message?.includes('otra empresa') || error.message?.includes('asignado a ti')) {
            return res.status(403).json({ error: error.message });
        }
        if (error.message?.includes('no está autorizado')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * POST /api/v1/management/trips/:id/location
 * Vía REST para el GPS del conductor — usada por la app móvil cuando corre en
 * SEGUNDO PLANO (las tareas en background de Expo no mantienen un socket vivo)
 * y como respaldo si el socket se cae en carretera. Reenvía la posición a la
 * misma sala `trip_{tripId}` de Socket.io que consume la web ("Ubicación en
 * Tiempo Real"), con el mismo shape que el evento del socket.
 * Solo el DRIVER asignado al viaje (o ADMIN/SUPER_ADMIN de la empresa).
 */
router.post('/:id/location', authorize(UserRole.DRIVER, UserRole.ADMIN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tripId = req.params.id as string;
        const { lat, lng, speed, bearing } = req.body ?? {};

        if (typeof lat !== 'number' || typeof lng !== 'number') {
            return res.status(400).json({ error: 'Payload de ubicación inválido: lat y lng numéricos son requeridos' });
        }
        // Rango razonable para Perú (mismo criterio que LocationGateway)
        if (lat < -20 || lat > 2 || lng < -85 || lng > -65) {
            return res.status(400).json({ error: 'Coordenadas fuera del rango permitido' });
        }

        if (req.user?.role === UserRole.DRIVER) {
            const assigned = await tripMgmtService.isDriverAssignedToTrip(req.user.sub, tripId);
            if (!assigned) return res.status(403).json({ error: 'No estás asignado a este viaje' });
        } else {
            // ADMIN: solo viajes de su propia empresa (SUPER_ADMIN pasa libre)
            await tripMgmtService.findById(tripId, req.user?.role, req.user?.companyId);
        }

        const locationUpdate = {
            tripId,
            lat,
            lng,
            speed: typeof speed === 'number' ? speed : 0,
            bearing: typeof bearing === 'number' ? bearing : 0,
            timestamp: new Date().toISOString(),
            driverId: req.user!.sub,
        };

        setLastKnownLocation(tripId, locationUpdate);
        emitToTrip(tripId, 'location_updated', locationUpdate);

        return res.status(200).json({ ok: true });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
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
