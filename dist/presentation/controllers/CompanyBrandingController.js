"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CompanyBrandingService_1 = require("../../application/services/CompanyBrandingService");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const router = (0, express_1.Router)();
const brandingService = new CompanyBrandingService_1.CompanyBrandingService();
/**
 * GET /api/v1/branding/public
 * Listar todas las empresas activas con su branding (directorio público, sin auth)
 */
router.get('/public', async (_req, res, next) => {
    try {
        const companies = await brandingService.listPublic();
        return res.status(200).json({ count: companies.length, companies });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/branding/slug/:slug
 * Obtener branding de una empresa por slug (sin auth — para páginas públicas)
 */
router.get('/slug/:slug', async (req, res, next) => {
    try {
        const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
        const company = await brandingService.getBySlug(slug);
        return res.status(200).json({ company });
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * GET /api/v1/branding/me
 * Obtener branding de la empresa del admin logueado
 */
router.get('/me', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.ADMIN, UserEntity_1.UserRole.SUPER_ADMIN), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(400).json({ error: 'No tienes empresa asignada' });
        const company = await brandingService.getById(companyId);
        return res.status(200).json({ company });
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * PATCH /api/v1/branding/me
 * Actualizar branding de la empresa del admin logueado
 */
router.patch('/me', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.ADMIN, UserEntity_1.UserRole.SUPER_ADMIN), async (req, res, next) => {
    try {
        const user = req.user;
        const companyId = user?.companyId;
        if (!companyId)
            return res.status(400).json({ error: 'No tienes empresa asignada' });
        const { slug, logoUrl, primaryColor, secondaryColor, bannerUrl, phone, address, city, website, description, contactEmail } = req.body;
        const updated = await brandingService.updateBranding({
            companyId, slug, logoUrl, primaryColor, secondaryColor, bannerUrl,
            phone, address, city, website, description, contactEmail,
        });
        return res.status(200).json({ message: 'Branding actualizado exitosamente', company: updated });
    }
    catch (error) {
        if (error.message)
            return res.status(400).json({ error: error.message });
        next(error);
    }
});
/**
 * PATCH /api/v1/branding/:companyId  (solo SUPER_ADMIN)
 * Actualizar branding de cualquier empresa
 */
router.patch('/:companyId', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.SUPER_ADMIN), async (req, res, next) => {
    try {
        const companyId = Array.isArray(req.params.companyId) ? req.params.companyId[0] : req.params.companyId;
        const { slug, logoUrl, primaryColor, secondaryColor, bannerUrl, phone, address, city, website, description, contactEmail } = req.body;
        const updated = await brandingService.updateBranding({
            companyId, slug, logoUrl, primaryColor, secondaryColor, bannerUrl,
            phone, address, city, website, description, contactEmail,
        });
        return res.status(200).json({ message: 'Branding actualizado exitosamente', company: updated });
    }
    catch (error) {
        if (error.message)
            return res.status(400).json({ error: error.message });
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=CompanyBrandingController.js.map