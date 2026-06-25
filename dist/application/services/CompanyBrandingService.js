"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyBrandingService = void 0;
const data_source_1 = require("../../infrastructure/database/data-source");
const CompanyEntity_1 = require("../../infrastructure/database/entities/CompanyEntity");
const logger_1 = require("../../infrastructure/logger");
class CompanyBrandingService {
    get repo() {
        return data_source_1.AppDataSource.getRepository(CompanyEntity_1.CompanyEntity);
    }
    /**
     * Obtener branding público de una empresa por slug.
     * No requiere autenticación — usado para páginas públicas.
     */
    async getBySlug(slug) {
        const company = await this.repo.findOne({ where: { slug, isActive: true } });
        if (!company)
            throw new Error(`Empresa con slug "${slug}" no encontrada`);
        return company;
    }
    /**
     * Obtener branding de una empresa por ID.
     */
    async getById(id) {
        const company = await this.repo.findOne({ where: { id } });
        if (!company)
            throw new Error('Empresa no encontrada');
        return company;
    }
    /**
     * Actualizar branding e información de contacto de una empresa.
     * Solo el admin de la empresa o un SUPER_ADMIN puede hacerlo.
     */
    async updateBranding(data) {
        const company = await this.repo.findOne({ where: { id: data.companyId } });
        if (!company)
            throw new Error('Empresa no encontrada');
        // Validar slug único si se está cambiando
        if (data.slug && data.slug !== company.slug) {
            const slugExists = await this.repo.findOne({ where: { slug: data.slug } });
            if (slugExists)
                throw new Error(`El slug "${data.slug}" ya está en uso por otra empresa`);
            // Validar formato del slug: solo letras, números y guiones
            if (!/^[a-z0-9-]+$/.test(data.slug)) {
                throw new Error('El slug solo puede contener letras minúsculas, números y guiones (-)');
            }
        }
        // Validar colores hex
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        if (data.primaryColor && !hexRegex.test(data.primaryColor)) {
            throw new Error('El color primario debe ser un código hex válido (ej: #6366f1)');
        }
        if (data.secondaryColor && !hexRegex.test(data.secondaryColor)) {
            throw new Error('El color secundario debe ser un código hex válido (ej: #8b5cf6)');
        }
        // Aplicar cambios
        if (data.slug !== undefined)
            company.slug = data.slug;
        if (data.logoUrl !== undefined)
            company.logoUrl = data.logoUrl;
        if (data.primaryColor !== undefined)
            company.primaryColor = data.primaryColor;
        if (data.secondaryColor !== undefined)
            company.secondaryColor = data.secondaryColor;
        if (data.bannerUrl !== undefined)
            company.bannerUrl = data.bannerUrl;
        if (data.phone !== undefined)
            company.phone = data.phone;
        if (data.address !== undefined)
            company.address = data.address;
        if (data.city !== undefined)
            company.city = data.city;
        if (data.website !== undefined)
            company.website = data.website;
        if (data.description !== undefined)
            company.description = data.description;
        if (data.contactEmail !== undefined)
            company.contactEmail = data.contactEmail;
        const saved = await this.repo.save(company);
        logger_1.logger.info(`Branding actualizado: empresa ${company.tradeName} (${company.id})`);
        return saved;
    }
    /**
     * Listar todas las empresas activas con su branding (para directorio público).
     */
    async listPublic() {
        const companies = await this.repo.find({
            where: { isActive: true },
            select: {
                id: true, tradeName: true, slug: true, logoUrl: true,
                primaryColor: true, secondaryColor: true, city: true,
                description: true, phone: true, website: true, contactEmail: true,
            },
            order: { tradeName: 'ASC' },
        });
        return companies;
    }
}
exports.CompanyBrandingService = CompanyBrandingService;
//# sourceMappingURL=CompanyBrandingService.js.map