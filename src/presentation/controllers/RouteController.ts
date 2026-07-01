import { Router, Request, Response, NextFunction } from 'express';
import { RouteService } from '../../application/services/RouteService';
import { AuditLogService } from '../../application/services/AuditLogService';

const router = Router();
const routeService = new RouteService();

// ==================== ESTACIONES / PARADEROS ====================

/**
 * POST /api/v1/routes/stations
 * Crear un paradero o agencia con coordenadas geográficas
 */
router.post('/stations', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId, name, address, city, latitude, longitude } = req.body;

        if (!name || !city || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Campos requeridos: name, city, latitude, longitude' });
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
router.put('/stations/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { name, city, address, latitude, longitude } = req.body;

        if (!name || !city) {
            return res.status(400).json({ error: 'Campos requeridos: name, city' });
        }

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
router.delete('/stations/:id', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId, name, serviceMode, polyline, waypoints } = req.body;

        if (!companyId || !name || !serviceMode || !waypoints) {
            return res.status(400).json({
                error: 'Campos requeridos: companyId, name, serviceMode, waypoints[]',
            });
        }

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
router.get('/company/:companyId', async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
