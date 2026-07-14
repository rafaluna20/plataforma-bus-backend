import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, DeleteDateColumn } from 'typeorm';
import { CompanyEntity } from './CompanyEntity';

export enum UserRole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    ADMIN = 'ADMIN',       // Administrador de empresa
    DRIVER = 'DRIVER',     // Conductor
    PASSENGER = 'PASSENGER', // Pasajero
    AGENCY_SELLER = 'AGENCY_SELLER', // Vendedor de agencia/paradero
}

@Entity('users')
export class UserEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Column({ type: 'varchar', length: 200, unique: true })
    email: string;

    @Column({ name: 'password_hash', type: 'varchar', length: 255 })
    passwordHash: string;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.PASSENGER })
    role: UserRole;

    @Column({ name: 'doc_type', type: 'varchar', length: 20, nullable: true })
    docType: string;

    @Column({ name: 'doc_num', type: 'varchar', length: 20, nullable: true })
    docNum: string;

    @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
    phone: string;

    /** N° de licencia de conducir (solo relevante para role=DRIVER, para el Manifiesto de Pasajeros) */
    @Column({ name: 'license_number', type: 'varchar', length: 30, nullable: true })
    licenseNumber: string | null;

    @Column({ name: 'balance', type: 'decimal', precision: 10, scale: 2, default: 0.00 })
    balance: number;

    @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity | null;

    @ManyToOne('StationEntity', { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'station_id' })
    station: any | null; // Using any to avoid circular dependency issues if StationEntity is not imported

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({ name: 'refresh_token', type: 'varchar', length: 500, nullable: true })
    refreshToken: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
    deletedAt: Date | null;
}

