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

    // ─── Manifiesto de Pasajeros (SUNAT/MTC) ──────────────────────────────────

    /**
     * Sedes/oficinas de la empresa para el encabezado del manifiesto impreso
     * (ej. terminal de origen, oficina de destino). Cada una: { city, address,
     * phone }. Puramente informativo/impresión, no afecta lógica de negocio.
     */
    @Column({ name: 'office_branches', type: 'jsonb', nullable: true })
    officeBranches: { city: string; address: string; phone: string }[] | null;

    /** Domicilio fiscal (distinto de la dirección operativa/sede) */
    @Column({ name: 'fiscal_address', type: 'text', nullable: true })
    fiscalAddress: string | null;

    /** N° de autorización SUNAT para impresión de manifiestos (fijo, no cambia por manifiesto) */
    @Column({ name: 'sunat_print_authorization', type: 'varchar', length: 30, nullable: true })
    sunatPrintAuthorization: string | null;

    /**
     * Serie del correlativo de manifiestos (ej. "001"). El número (correlativo)
     * en sí se lleva en manifest_next_number y se congela por viaje la primera
     * vez que se imprime (ver TripEntity.manifestNumber).
     */
    @Column({ name: 'manifest_series', type: 'varchar', length: 10, nullable: true, default: '001' })
    manifestSeries: string | null;

    /** Próximo correlativo de manifiesto a asignar (se incrementa al imprimir por primera vez) */
    @Column({ name: 'manifest_next_number', type: 'int', default: 1 })
    manifestNextNumber: number;

    /** Próximo correlativo de boleto a asignar (se incrementa en cada venta/reserva) */
    @Column({ name: 'ticket_next_number', type: 'int', default: 1 })
    ticketNextNumber: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt: Date;
}
