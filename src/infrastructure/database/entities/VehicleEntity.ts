import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, DeleteDateColumn } from 'typeorm';
import { CompanyEntity } from './CompanyEntity';

export enum VehicleType {
    BUS_1P = 'BUS_1P',
    BUS_2P = 'BUS_2P',
    MINIVAN = 'MINIVAN',
    AUTO = 'AUTO',
}

export enum ServiceMode {
    INTERPROVINCIAL = 'INTERPROVINCIAL',
    LOCAL = 'LOCAL',
}

@Entity('vehicles')
export class VehicleEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity;

    @Column({ name: 'plate_number', type: 'varchar', length: 10, unique: true })
    plateNumber: string;

    @Column({ type: 'enum', enum: VehicleType, name: 'v_type' })
    vehicleType: VehicleType;

    @Column({ type: 'enum', enum: ServiceMode, name: 'service_mode' })
    serviceMode: ServiceMode;

    @Column({ name: 'seat_template', type: 'jsonb' })
    seatTemplate: any;

    @Column({ type: 'int' })
    capacity: number;

    @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
    imageUrl: string | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    // ─── Datos para el Manifiesto de Pasajeros (SUNAT/MTC) ────────────────────

    /** Marca del vehículo (ej. "SCANIA", "MERCEDES BENZ") */
    @Column({ type: 'varchar', length: 60, nullable: true })
    brand: string | null;

    /** Tarjeta Única de Circulación (TUC) */
    @Column({ name: 'circulation_card', type: 'varchar', length: 30, nullable: true })
    circulationCard: string | null;

    /** N° de póliza de seguro (SOAT/AFOCAT) vigente */
    @Column({ name: 'insurance_policy', type: 'varchar', length: 30, nullable: true })
    insurancePolicy: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
    deletedAt: Date | null;
}

