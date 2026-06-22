import { Router, Request, Response, NextFunction } from 'express';
import { VehicleService } from '../../application/services/VehicleService';

const router = Router();
const vehicleService = new VehicleService();

/**
 * POST /api/v1/vehicles
 * Registrar un vehículo nuevo en la flota de una empresa
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId, plateNumber, vehicleType, serviceMode, seatTemplate, capacity, imageUrl } = req.body;

        if (!companyId || !plateNumber || !vehicleType || !serviceMode || !capacity) {
            return res.status(400).json({
                error: 'Campos requeridos: companyId, plateNumber, vehicleType, serviceMode, capacity',
            });
        }

        const vehicle = await vehicleService.create({
            companyId, plateNumber, vehicleType, serviceMode, seatTemplate, capacity, imageUrl,
        });

        return res.status(201).json({ message: 'Vehículo registrado exitosamente', vehicle });
    } catch (error: any) {
        if (error.message?.includes('placa')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/vehicles/company/:companyId
 * Listar la flota de una empresa
 */
router.get('/company/:companyId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.params.companyId as string;
        const vehicles = await vehicleService.findByCompany(companyId);
        return res.status(200).json({ count: vehicles.length, vehicles });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/vehicles/:id
 * Obtener detalle de un vehículo (incluye plantilla de asientos)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const vehicle = await vehicleService.findById(id);
        return res.status(200).json(vehicle);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * PUT /api/v1/vehicles/:id
 * Actualizar configuración de vehículo (plantilla de asientos, estado)
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const vehicle = await vehicleService.update(id, req.body);
        return res.status(200).json({ message: 'Vehículo actualizado', vehicle });
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/vehicles/templates/defaults
 * Obtener plantillas predeterminadas de asientos por tipo de vehículo
 */
router.get('/templates/defaults', async (req: Request, res: Response) => {
    const templates = vehicleService.getDefaultTemplates();
    return res.status(200).json(templates);
});

export default router;
