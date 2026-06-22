"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const TripManagementService_1 = require("../../application/services/TripManagementService");
const router = (0, express_1.Router)();
const tripMgmtService = new TripManagementService_1.TripManagementService();
/**
 * POST /api/v1/management/trips
 * Programar una nueva salida/viaje
 */
router.post('/', async (req, res, next) => {
    try {
        const { routeId, vehicleId, departureTime } = req.body;
        if (!routeId || !vehicleId || !departureTime) {
            return res.status(400).json({ error: 'Campos requeridos: routeId, vehicleId, departureTime' });
        }
        const trip = await tripMgmtService.create({ routeId, vehicleId, departureTime: new Date(departureTime) });
        return res.status(201).json({ message: 'Viaje programado exitosamente', trip });
    }
    catch (error) {
        if (error.message?.includes('misma empresa'))
            return res.status(400).json({ error: error.message });
        if (error.message?.includes('programado'))
            return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrad'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * PATCH /api/v1/management/trips/:id/status
 * Actualizar el estado de un viaje (SCHEDULED → BOARDING → IN_TRANSIT → COMPLETED)
 */
router.patch('/:id/status', async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ error: 'Campo requerido: status' });
        const tripId = req.params.id;
        const trip = await tripMgmtService.updateStatus({ tripId, status });
        return res.status(200).json({ message: `Estado actualizado a ${status}`, trip });
    }
    catch (error) {
        if (error.message?.includes('No se puede cambiar'))
            return res.status(400).json({ error: error.message });
        if (error.message?.includes('no encontrado'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * GET /api/v1/management/trips/company/:companyId
 * Listar viajes de una empresa (opcionalmente filtrar por estado con ?status=SCHEDULED)
 */
router.get('/company/:companyId', async (req, res, next) => {
    try {
        const { status } = req.query;
        const companyId = req.params.companyId;
        const result = await tripMgmtService.findByCompany(companyId, status);
        return res.status(200).json({ count: result.total, trips: result.data, page: result.page, totalPages: result.totalPages });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/management/trips/:id
 * Obtener detalle completo de un viaje (ruta, waypoints, vehículo)
 */
router.get('/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const trip = await tripMgmtService.findById(id);
        return res.status(200).json(trip);
    }
    catch (error) {
        if (error.message?.includes('no encontrado'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * GET /api/v1/management/trips/:id/manifest
 * Obtener el manifiesto de pasajeros de un viaje
 */
router.get('/:id/manifest', async (req, res, next) => {
    try {
        const id = req.params.id;
        const manifest = await tripMgmtService.getPassengerManifest(id);
        return res.status(200).json({ count: manifest.length, passengers: manifest });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=TripManagementController.js.map