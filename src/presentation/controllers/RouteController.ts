import { Router, Request, Response, NextFunction } from 'express';
import { RouteService } from '../../application/services/RouteService';
import { AuditLogService } from '../../application/services/AuditLogService';
import { authorizeCompany, authorizeOwnCompanyResource } from '../middlewares/auth.middleware';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { AppDataSource } from '../../infrastructure/database/data-source';
import { StationEntity } from '../../infrastructure/database/entities/StationEntity';
import { validateBody, CreateStationSchema, UpdateStationSchema, CreateRouteSchema, UpdateRouteSchema } from '../validators/schemas';

const router = Router();
const routeService = new RouteService();

const resolveRouteCompanyId = async (req: Request) => {
    const route = await routeService.findById(req.params.id as string);
    return (route as any).company?.id ?? null;
};

/**
 * Las estaciones son un recurso especial: pueden no tener empresa dueña
 * (terminales públicos). En ese caso solo SUPER_ADMIN puede crear/editar/borrar;
 * si tienen empresa, solo esa empresa (o SUPER_ADMIN) puede hacerlo.
 */
const authorizeStationOwnership = (resolveStationCompanyId: (req: Request) => Promise<string | null | undefined>) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            res.status(401).json({ error: 'No autenticado.' });
            return;
        }
        if (req.user.role === UserRole.SUPER_ADMIN) {
            next();
            return;
        }
        try {
            const stationCompanyId = await resolveStationCompanyId(req);
            if (stationCompanyId == null || stationCompanyId !== req.user.companyId) {
                res.status(403).json({ error: 'No tienes permisos para administrar este paradero.' });
                return;
            }
            next();
        } catch (err: any) {
            if (err.message?.includes('no encontrad')) {
                res.status(404).json({ error: err.message });
                return;
            }
            next(err);
        }
    };
};

// ==================== ESTACIONES / PARADEROS ====================

/**
 * POST /api/v1/routes/stations
 * Crear un paradero o agencia con coordenadas geográficas
 */
router.post('/stations', authorizeCompany, validateBody(CreateStationSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId, name, address, city, latitude, longitude } = req.body;

        // Solo SUPER_ADMIN puede crear terminales públicos (sin empresa dueña)
        if (!companyId && req.user!.role !== UserRole.SUPER_ADMIN) {
            return res.status(403).json({ error: 'Solo un SUPER_ADMIN puede crear un terminal público (sin empresa).' });
        }

        const station = await routeService.createStation({ companyId, name, address, city, latitude, longitude });
        return res.status(201).json({ message: 'Estación creada exitosamente', station });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/routes/stations?city=Lima
 * Listar paraderos. El parámetro `city` es opcional; sin él, retorna todas.
 */
router.get('/stations', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { city } = req.query;
        let stations;
        if (city) {
            stations = await routeService.findStationsByCity(city as string);
        } else {
            stations = await routeService.findAllStations();
        }
        return res.status(200).json({ count: stations.length, stations });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/v1/routes/stations/:id
 * Actualizar nombre, ciudad, dirección y coordenadas de una estación
 */
const resolveStationCompanyId = async (req: Request) => {
    const station = await AppDataSource.getRepository(StationEntity).findOne({
        where: { id: req.params.id as string },
        relations: { company: true },
    });
    if (!station) throw new Error('Estación no encontrada');
    return station.company?.id ?? null;
};

router.put('/stations/:id', authorizeStationOwnership(resolveStationCompanyId), validateBody(UpdateStationSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { name, city, address, latitude, longitude } = req.body;

        const station = await routeService.updateStation(id, { name, city, address, latitude, longitude });
        return res.status(200).json({ message: 'Estación actualizada exitosamente', station });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * DELETE /api/v1/routes/stations/:id
 * Desactivar (soft-delete) una estación
 */
router.delete('/stations/:id', authorizeStationOwnership(resolveStationCompanyId), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        await routeService.deleteStation(id);
        return res.status(200).json({ message: 'Estación eliminada exitosamente' });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('en uso')) return res.status(409).json({ error: error.message });
        next(error);
    }
});

// ==================== RUTAS ====================

/**
 * POST /api/v1/routes
 * Crear una ruta completa con sus paradas intermedias (waypoints)
 * Body: { companyId, name, serviceMode, polyline?, waypoints: [{ stationId, stopOrder, estimatedDurationMins, basePrice }] }
 */
router.post('/', authorizeCompany, validateBody(CreateRouteSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId, name, serviceMode, polyline, waypoints } = req.body;

        const route = await routeService.createRoute({ companyId, name, serviceMode, polyline, waypoints });

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_ROUTE',
            entityName: 'RouteEntity',
            entityId: route.id,
            newValue: { name: route.name, serviceMode: route.serviceMode },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(201).json({ message: 'Ruta creada exitosamente', route });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('secuenciales') || error.message?.includes('2 paradas')) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * GET /api/v1/routes/company/:companyId
 * Listar todas las rutas de una empresa con sus waypoints
 */
router.get('/company/:companyId', authorizeCompany, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.params.companyId as string;
        const routes = await routeService.findByCompany(companyId);
        return res.status(200).json({ count: routes.length, routes });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/routes/:id
 * Obtener detalle de una ruta con todos sus waypoints
 */
router.get('/:id', authorizeOwnCompanyResource(resolveRouteCompanyId), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const route = await routeService.findById(id);
        return res.status(200).json(route);
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * PUT /api/v1/routes/:id
 * Actualizar una ruta y sus waypoints
 */
router.put('/:id', authorizeOwnCompanyResource(resolveRouteCompanyId), validateBody(UpdateRouteSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const route = await routeService.updateRoute(id, req.body);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'UPDATE_ROUTE',
            entityName: 'RouteEntity',
            entityId: id,
            newValue: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({ message: 'Ruta actualizada exitosamente', route });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('secuenciales') || error.message?.includes('2 paradas')) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * DELETE /api/v1/routes/:id
 * Eliminar una ruta
 */
router.delete('/:id', authorizeOwnCompanyResource(resolveRouteCompanyId), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        await routeService.deleteRoute(id);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'DELETE_ROUTE',
            entityName: 'RouteEntity',
            entityId: id,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({ message: 'Ruta eliminada exitosamente' });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

export default router;
