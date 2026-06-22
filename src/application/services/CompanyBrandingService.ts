import { AppDataSource } from '../../infrastructure/database/data-source';
import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
import { logger } from '../../infrastructure/logger';

export interface UpdateBrandingDTO {
    companyId: string;
    slug?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    bannerUrl?: string;
    phone?: string;
    address?: string;
    city?: string;
    website?: string;
    description?: string;
    contactEmail?: string;
}

export class CompanyBrandingService {
    private get repo() {
        return AppDataSource.getRepository(CompanyEntity);
    }

    /**
     * Obtener branding público de una empresa por slug.
     * No requiere autenticación — usado para páginas públicas.
     */
    public async getBySlug(slug: string): Promise<CompanyEntity> {
        const company = await this.repo.findOne({ where: { slug, isActive: true } });
        if (!company) throw new Error(`Empresa con slug "${slug}" no encontrada`);
        return company;
    }

    /**
     * Obtener branding de una empresa por ID.
     */
    public async getById(id: string): Promise<CompanyEntity> {
        const company = await this.repo.findOne({ where: { id } });
        if (!company) throw new Error('Empresa no encontrada');
        return company;
    }

    /**
     * Actualizar branding e información de contacto de una empresa.
     * Solo el admin de la empresa o un SUPER_ADMIN puede hacerlo.
     */
    public async updateBranding(data: UpdateBrandingDTO): Promise<CompanyEntity> {
        const company = await this.repo.findOne({ where: { id: data.companyId } });
        if (!company) throw new Error('Empresa no encontrada');

        // Validar slug único si se está cambiando
        if (data.slug && data.slug !== company.slug) {
            const slugExists = await this.repo.findOne({ where: { slug: data.slug } });
            if (slugExists) throw new Error(`El slug "${data.slug}" ya está en uso por otra empresa`);

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
        if (data.slug !== undefined) company.slug = data.slug;
        if (data.logoUrl !== undefined) company.logoUrl = data.logoUrl;
        if (data.primaryColor !== undefined) company.primaryColor = data.primaryColor;
        if (data.secondaryColor !== undefined) company.secondaryColor = data.secondaryColor;
        if (data.bannerUrl !== undefined) company.bannerUrl = data.bannerUrl;
        if (data.phone !== undefined) company.phone = data.phone;
        if (data.address !== undefined) company.address = data.address;
        if (data.city !== undefined) company.city = data.city;
        if (data.website !== undefined) company.website = data.website;
        if (data.description !== undefined) company.description = data.description;
        if (data.contactEmail !== undefined) company.contactEmail = data.contactEmail;

        const saved = await this.repo.save(company);
        logger.info(`Branding actualizado: empresa ${company.tradeName} (${company.id})`);
        return saved;
    }

    /**
     * Listar todas las empresas activas con su branding (para directorio público).
     */
    public async listPublic(): Promise<Partial<CompanyEntity>[]> {
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
