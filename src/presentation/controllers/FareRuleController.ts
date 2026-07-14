import { Router, Request, Response, NextFunction } from 'express';
import { FareRuleService } from '../../application/services/FareRuleService';
import { AuditLogService } from '../../application/services/AuditLogService';
import { validateBody, CreateFareRuleSchema, UpdateFareRuleSchema } from '../validators/schemas';

const router = Router();
const fareRuleService = new FareRuleService();

/**
 * POST /api/v1/fare-rules
 * Crear una regla de tarifa dinámica (franja horaria o fecha especial) para una ruta.
 * ✅ REQUIERE ADMIN/SUPER_ADMIN de la empresa dueña de la ruta.
 */
router.post('/', validateBody(CreateFareRuleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rule = await fareRuleService.create({
            ...req.body,
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
        });

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_FARE_RULE',
            entityName: 'FareRuleEntity',
            entityId: rule.id,
            newValue: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(201).json({ message: 'Regla de tarifa creada exitosamente', rule });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrada') || error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('requieren') || error.message?.includes('debe ser mayor')) return res.status(400).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/fare-rules/route/:routeId
 * Listar las reglas de tarifa de una ruta.
 */
router.get('/route/:routeId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rules = await fareRuleService.listByRoute(req.params.routeId as string, req.user?.role, req.user?.companyId);
        return res.status(200).json({ rules, total: rules.length });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * PATCH /api/v1/fare-rules/:id
 * Actualizar una regla de tarifa (incluye activar/desactivar).
 */
router.patch('/:id', validateBody(UpdateFareRuleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rule = await fareRuleService.update(req.params.id as string, req.body, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'UPDATE_FARE_RULE',
            entityName: 'FareRuleEntity',
            entityId: rule.id,
            newValue: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({ message: 'Regla de tarifa actualizada exitosamente', rule });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * DELETE /api/v1/fare-rules/:id
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await fareRuleService.delete(req.params.id as string, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'DELETE_FARE_RULE',
            entityName: 'FareRuleEntity',
            entityId: req.params.id as string,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({ message: 'Regla de tarifa eliminada exitosamente' });
    } catch (error: any) {
        if (error.message?.includes('otra empresa')) return res.status(403).json({ error: error.message });
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

export default router;
