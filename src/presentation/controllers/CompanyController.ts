import { Router, Request, Response, NextFunction } from 'express';
import { CompanyService } from '../../application/services/CompanyService';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { authorize } from '../middlewares/auth.middleware';

const router = Router();
const companyService = new CompanyService();

/**
 * Verifica que el usuario pertenezca a la empresa de :id (o sea SUPER_ADMIN).
 * A diferencia de authorizeCompany (que lee companyId de params/body), aquí el
 * propio :id de la ruta ES el id de la empresa.
 */
const authorizeSelfCompany = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ error: 'No autenticado.' });
        return;
    }
    if (req.user.role === UserRole.SUPER_ADMIN) {
        next();
        return;
    }
    if (req.user.companyId !== req.params.id) {
        res.status(403).json({ error: 'No tienes permisos para acceder a los recursos de esta empresa.' });
        return;
    }
    next();
};

/**
 * POST /api/v1/companies
 * Registrar una nueva empresa operadora en el marketplace.
 * Solo SUPER_ADMIN puede dar de alta nuevos tenants del marketplace.
 */
router.post('/', authorize(UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { ruc, tradeName, legalName, commissionRate } = req.body;

        if (!ruc || !tradeName || !legalName) {
            return res.status(400).json({ error: 'Campos requeridos: ruc, tradeName, legalName' });
        }

        const company = await companyService.create({ ruc, tradeName, legalName, commissionRate });

        return res.status(201).json({
            message: 'Empresa registrada exitosamente',
            company,
        });
    } catch (error: any) {
        if (error.message?.includes('RUC')) return res.status(409).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/companies
 * Listar todas las empresas activas del marketplace.
 * Solo SUPER_ADMIN: expone RUC y comisión de todas las empresas competidoras.
 */
router.get('/', authorize(UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companies = await companyService.findAll();
        return res.status(200).json({ count: companies.length, companies });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/companies/:id
 * Obtener detalle de una empresa
 */
router.get('/:id', authorizeSelfCompany, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const company = await companyService.findById(req.params.id as string);
        return res.status(200).json(company);
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * PUT /api/v1/companies/:id
 * Actualizar datos de empresa
 */
router.put('/:id', authorizeSelfCompany, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const updates = { ...req.body };

        // commissionRate (la comisión del marketplace) e isActive (alta/baja del
        // tenant) son palancas de negocio del operador de la plataforma, no algo
        // que una empresa deba poder cambiarse a sí misma.
        if (req.user!.role !== UserRole.SUPER_ADMIN) {
            delete updates.commissionRate;
            delete updates.isActive;
        }

        const company = await companyService.update(req.params.id as string, updates);
        return res.status(200).json({ message: 'Empresa actualizada', company });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

export default router;
