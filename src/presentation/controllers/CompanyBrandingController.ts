import { Router, Request, Response, NextFunction } from 'express';
import { CompanyBrandingService } from '../../application/services/CompanyBrandingService';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { validateBody, UpdateBrandingSchema } from '../validators/schemas';

const router = Router();
const brandingService = new CompanyBrandingService();

/**
 * GET /api/v1/branding/public
 * Listar todas las empresas activas con su branding (directorio público, sin auth)
 */
router.get('/public', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const companies = await brandingService.listPublic();
        return res.status(200).json({ count: companies.length, companies });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/branding/slug/:slug
 * Obtener branding de una empresa por slug (sin auth — para páginas públicas)
 */
router.get('/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
        const company = await brandingService.getBySlug(slug);
        return res.status(200).json({ company });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/branding/id/:id
 * Obtener branding de una empresa por ID (sin auth — fallback cuando slug no está configurado)
 */
router.get('/id/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const company = await brandingService.getById(id);
        return res.status(200).json({ company });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * GET /api/v1/branding/me
 * Obtener branding de la empresa del admin logueado
 */
router.get('/me', authenticate, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = (req as any).user?.companyId;
        if (!companyId) return res.status(400).json({ error: 'No tienes empresa asignada' });
        const company = await brandingService.getById(companyId);
        return res.status(200).json({ company });
    } catch (error: any) {
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * PATCH /api/v1/branding/me
 * Actualizar branding de la empresa del admin logueado
 */
router.patch('/me', authenticate, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), validateBody(UpdateBrandingSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        const companyId = user?.companyId;
        if (!companyId) return res.status(400).json({ error: 'No tienes empresa asignada' });

        const { slug, logoUrl, primaryColor, secondaryColor, bannerUrl,
                phone, address, city, website, description, contactEmail, sliderImages } = req.body;

        const updated = await brandingService.updateBranding({
            companyId, slug, logoUrl, primaryColor, secondaryColor, bannerUrl,
            phone, address, city, website, description, contactEmail, sliderImages,
        });

        return res.status(200).json({ message: 'Branding actualizado exitosamente', company: updated });
    } catch (error: any) {
        if (error.message) return res.status(400).json({ error: error.message });
        next(error);
    }
});

/**
 * PATCH /api/v1/branding/:companyId  (solo SUPER_ADMIN)
 * Actualizar branding de cualquier empresa
 */
router.patch('/:companyId', authenticate, authorize(UserRole.SUPER_ADMIN), validateBody(UpdateBrandingSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = Array.isArray(req.params.companyId) ? req.params.companyId[0] : req.params.companyId;
        const { slug, logoUrl, primaryColor, secondaryColor, bannerUrl,
                phone, address, city, website, description, contactEmail, sliderImages } = req.body;

        const updated = await brandingService.updateBranding({
            companyId, slug, logoUrl, primaryColor, secondaryColor, bannerUrl,
            phone, address, city, website, description, contactEmail, sliderImages,
        });

        return res.status(200).json({ message: 'Branding actualizado exitosamente', company: updated });
    } catch (error: any) {
        if (error.message) return res.status(400).json({ error: error.message });
        next(error);
    }
});

export default router;
