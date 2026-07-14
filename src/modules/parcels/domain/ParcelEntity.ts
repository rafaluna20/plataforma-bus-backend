import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TripEntity } from '../../trips/domain/TripEntity';
import { RouteWaypointEntity } from '../../../infrastructure/database/entities/RouteWaypointEntity';
import { PaymentStatus } from '../../bookings/domain/BookingEntity';
import { UserEntity } from '../../../infrastructure/database/entities/UserEntity';

export enum ParcelStatus {
    RECEIVED = 'RECEIVED',
    IN_TRANSIT = 'IN_TRANSIT',
    READY_FOR_PICKUP = 'READY_FOR_PICKUP',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED',
}

@Entity('parcels')
export class ParcelEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * Viaje asignado. Puede ser null: una encomienda "pendiente de asignar"
     * vive en la bandeja de la empresa (buscable por origen/destino) hasta
     * que el personal la asigne a un viaje concreto al momento del despacho.
     */
    @ManyToOne(() => TripEntity, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'trip_id' })
    trip: TripEntity | null;

    @Column({ name: 'sender_name', type: 'varchar', length: 150 })
    senderName: string;

    @Column({ name: 'sender_doc', type: 'varchar', length: 20 })
    senderDoc: string;

    @Column({ name: 'receiver_name', type: 'varchar', length: 150 })
    receiverName: string;

    @Column({ name: 'receiver_doc', type: 'varchar', length: 20 })
    receiverDoc: string;

    @ManyToOne(() => RouteWaypointEntity)
    @JoinColumn({ name: 'start_waypoint_id' })
    startWaypoint: RouteWaypointEntity;

    @ManyToOne(() => RouteWaypointEntity)
    @JoinColumn({ name: 'end_waypoint_id' })
    endWaypoint: RouteWaypointEntity;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'weight_kg', type: 'decimal', precision: 5, scale: 2, nullable: true })
    weightKg: number;

    @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 })
    totalPrice: number;

    @Column({ type: 'enum', enum: ParcelStatus, default: ParcelStatus.RECEIVED })
    status: ParcelStatus;

    @Column({ name: 'payment_status', type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING_CASH })
    paymentStatus: PaymentStatus;

    // Vendedor que registró la encomienda
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'seller_id' })
    seller: UserEntity | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;
}
