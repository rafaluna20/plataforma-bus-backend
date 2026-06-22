import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RouteEntity } from './RouteEntity';
import { VehicleEntity } from './VehicleEntity';

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

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;
}
