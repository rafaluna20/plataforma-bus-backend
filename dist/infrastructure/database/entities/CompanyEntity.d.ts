export declare class CompanyEntity {
    id: string;
    ruc: string;
    tradeName: string;
    legalName: string;
    commissionRate: number;
    isActive: boolean;
    /** Slug único para URL amigable: "transportes-flash" */
    slug: string | null;
    /** URL del logo de la empresa (PNG/SVG recomendado) */
    logoUrl: string | null;
    /** Color primario en hex: "#6366f1" */
    primaryColor: string | null;
    /** Color secundario en hex: "#8b5cf6" */
    secondaryColor: string | null;
    /** URL de imagen de banner/cabecera del panel */
    bannerUrl: string | null;
    /** Teléfono principal de la empresa */
    phone: string | null;
    /** Dirección física de la empresa */
    address: string | null;
    /** Ciudad principal de operaciones */
    city: string | null;
    /** Sitio web oficial */
    website: string | null;
    /** Descripción corta de la empresa (para página pública) */
    description: string | null;
    /** Email de contacto público */
    contactEmail: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=CompanyEntity.d.ts.map