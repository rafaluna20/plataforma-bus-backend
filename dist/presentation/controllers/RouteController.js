"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const RouteService_1 = require("../../application/services/RouteService");
const router = (0, express_1.Router)();
const routeService = new RouteService_1.RouteService();
// ==================== ESTACIONES / PARADEROS ====================
/**
 * POST /api/v1/routes/stations
 * Crear un paradero o agencia con coordenadas geográficas
 */
router.post('/stations', async (req, res, next) => {
    try {
        const { companyId, name, address, city, latitude, longitude } = req.body;
        if (!name || !city || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Campos requeridos: name, city, latitude, longitude' });
        }
        const station = await routeService.createStation({ companyId, name, address, city, latitude, longitude });
        return res.status(201).json({ message: 'Estación creada exitosamente', station });
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * GET /api/v1/routes/stations?city=Lima
 * Listar paraderos por ciudad
 */
router.get('/stations', async (req, res, next) => {
    try {
        const { city } = req.query;
        if (!city)
            return res.status(400).json({ error: 'Parámetro requerido: city' });
        const stations = await routeService.findStationsByCity(city);
        return res.status(200).json({ count: stations.length, stations });
    }
    catch (error) {
        next(error);
    }
});
// ==================== RUTAS ====================
/**
 * POST /api/v1/routes
 * Crear una ruta completa con sus paradas intermedias (waypoints)
 * Body: { companyId, name, serviceMode, polyline?, waypoints: [{ stationId, stopOrder, estimatedDurationMins, basePrice }] }
 */
router.post('/', async (req, res, next) => {
    try {
        const { companyId, name, serviceMode, polyline, waypoints } = req.body;
        if (!companyId || !name || !serviceMode || !waypoints) {
            return res.status(400).json({
                error: 'Campos requeridos: companyId, name, serviceMode, waypoints[]',
            });
        }
        const route = await routeService.createRoute({ companyId, name, serviceMode, polyline, waypoints });
        return res.status(201).json({ message: 'Ruta creada exitosamente', route });
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
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
router.get('/company/:companyId', async (req, res, next) => {
    try {
        const companyId = req.params.companyId;
        const routes = await routeService.findByCompany(companyId);
        return res.status(200).json({ count: routes.length, routes });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/routes/:id
 * Obtener detalle de una ruta con todos sus waypoints
 */
router.get('/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const route = await routeService.findById(id);
        return res.status(200).json(route);
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=RouteController.js.map