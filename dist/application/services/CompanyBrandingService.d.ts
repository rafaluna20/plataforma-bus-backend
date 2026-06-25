import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
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
export declare class CompanyBrandingService {
    private get repo();
    /**
     * Obtener branding público de una empresa por slug.
     * No requiere autenticación — usado para páginas públicas.
     */
    getBySlug(slug: string): Promise<CompanyEntity>;
    /**
     * Obtener branding de una empresa por ID.
     */
    getById(id: string): Promise<CompanyEntity>;
    /**
     * Actualizar branding e información de contacto de una empresa.
     * Solo el admin de la empresa o un SUPER_ADMIN puede hacerlo.
     */
    updateBranding(data: UpdateBrandingDTO): Promise<CompanyEntity>;
    /**
     * Listar todas las empresas activas con su branding (para directorio público).
     */
    listPublic(): Promise<Partial<CompanyEntity>[]>;
}
//# sourceMappingURL=CompanyBrandingService.d.ts.map