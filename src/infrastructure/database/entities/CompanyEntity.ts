import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('companies')
export class CompanyEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 11, unique: true })
    ruc: string;

    @Column({ name: 'trade_name', type: 'varchar', length: 150 })
    tradeName: string;

    @Column({ name: 'legal_name', type: 'varchar', length: 150 })
    legalName: string;

    @Column({ name: 'commission_rate', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
    commissionRate: number;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    // ─── Branding & Identidad Visual ──────────────────────────────────────────

    /** Slug único para URL amigable: "transportes-flash" */
    @Column({ type: 'varchar', length: 80, unique: true, nullable: true })
    slug: string | null;

    /** URL del logo de la empresa (PNG/SVG recomendado) */
    @Column({ name: 'logo_url', type: 'text', nullable: true })
    logoUrl: string | null;

    /** Color primario en hex: "#6366f1" */
    @Column({ name: 'primary_color', type: 'varchar', length: 7, nullable: true, default: '#6366f1' })
    primaryColor: string | null;

    /** Color secundario en hex: "#8b5cf6" */
    @Column({ name: 'secondary_color', type: 'varchar', length: 7, nullable: true, default: '#8b5cf6' })
    secondaryColor: string | null;

    /** URL de imagen de banner/cabecera del panel */
    @Column({ name: 'banner_url', type: 'text', nullable: true })
    bannerUrl: string | null;

    /** Imágenes para el carrusel principal (slider) de la página pública */
    @Column({ name: 'slider_images', type: 'simple-array', nullable: true })
    sliderImages: string[] | null;

    // ─── Datos de Contacto ────────────────────────────────────────────────────

    /** Teléfono principal de la empresa */
    @Column({ type: 'varchar', length: 20, nullable: true })
    phone: string | null;

    /** Dirección física de la empresa */
    @Column({ type: 'text', nullable: true })
    address: string | null;

    /** Ciudad principal de operaciones */
    @Column({ type: 'varchar', length: 100, nullable: true })
    city: string | null;

    /** Sitio web oficial */
    @Column({ type: 'varchar', length: 255, nullable: true })
    website: string | null;

    /** Descripción corta de la empresa (para página pública) */
    @Column({ type: 'text', nullable: true })
    description: string | null;

    /** Email de contacto público */
    @Column({ name: 'contact_email', type: 'varchar', length: 150, nullable: true })
    contactEmail: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt: Date;
}
