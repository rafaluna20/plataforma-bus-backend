import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RouteEntity } from '../../../infrastructure/database/entities/RouteEntity';
import { VehicleEntity } from '../../../infrastructure/database/entities/VehicleEntity';
import { UserEntity } from '../../../infrastructure/database/entities/UserEntity';

export enum TripStatus {
    SCHEDULED = 'SCHEDULED',
    BOARDING = 'BOARDING',
    IN_TRANSIT = 'IN_TRANSIT',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

@Entity('trips')
export class TripEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => RouteEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'route_id' })
    route: RouteEntity;

    @ManyToOne(() => VehicleEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'vehicle_id' })
    vehicle: VehicleEntity;

    // Conductor asignado al viaje (opcional). Usuario con rol DRIVER de la misma empresa.
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'driver_id' })
    driver: UserEntity | null;

    @Column({ name: 'departure_time', type: 'timestamp with time zone' })
    departureTime: Date;

    @Column({ type: 'enum', enum: TripStatus, default: TripStatus.SCHEDULED })
    status: TripStatus;

    @Column({
        name: 'actual_location',
        type: 'geometry',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: true,
    })
    actualLocation: string; // Used for periodic auditing/snapshots, not real-time pub-sub

    // ─── Datos para el Manifiesto de Pasajeros (SUNAT/MTC) ────────────────────
    // Copiloto/auxiliar son texto libre (no cuentas de usuario) porque a
    // menudo no son personal registrado en el sistema, y varían por viaje.

    @Column({ name: 'copilot_name', type: 'varchar', length: 150, nullable: true })
    copilotName: string | null;

    @Column({ name: 'copilot_license', type: 'varchar', length: 30, nullable: true })
    copilotLicense: string | null;

    @Column({ name: 'auxiliar_name', type: 'varchar', length: 150, nullable: true })
    auxiliarName: string | null;

    /**
     * Número de manifiesto (ej. "001-010740"), asignado UNA sola vez -- la
     * primera vez que se imprime el manifiesto de este viaje -- y reutilizado
     * en reimpresiones. Null hasta la primera impresión.
     */
    @Column({ name: 'manifest_number', type: 'varchar', length: 20, nullable: true })
    manifestNumber: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;
}
