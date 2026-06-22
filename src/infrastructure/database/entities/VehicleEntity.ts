import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
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

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;
}
