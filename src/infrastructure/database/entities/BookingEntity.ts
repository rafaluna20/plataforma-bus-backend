import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, DeleteDateColumn } from 'typeorm';
// Import directo al domain (no al barrel del módulo) para evitar cargar
// TripManagementController/TripManagementService solo por la entidad, y
// prevenir un ciclo: TripManagementService también importa BookingEntity.
import { TripEntity } from '../../../modules/trips/domain/TripEntity';
import { RouteWaypointEntity } from './RouteWaypointEntity';
import { UserEntity } from './UserEntity';

export enum PaymentStatus {
    PENDING_CASH = 'PENDING_CASH',
    PENDING_DIGITAL = 'PENDING_DIGITAL',
    PAID_DIGITAL = 'PAID_DIGITAL',
    FAILED = 'FAILED',
    PAID = 'PAID',
    CANCELLED = 'CANCELLED',
    REFUNDED = 'REFUNDED',
}

@Entity('bookings')
@Unique('unique_seat_trip_booking', ['trip', 'seatId', 'startWaypoint'])
export class BookingEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => TripEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'trip_id' })
    trip: TripEntity;

    @Column({ name: 'passenger_name', type: 'varchar', length: 150 })
    passengerName: string;

    @Column({ name: 'passenger_doc_type', type: 'varchar', length: 20 })
    passengerDocType: string;

    @Column({ name: 'passenger_doc_num', type: 'varchar', length: 20 })
    passengerDocNum: string;

    @ManyToOne(() => RouteWaypointEntity)
    @JoinColumn({ name: 'start_waypoint_id' })
    startWaypoint: RouteWaypointEntity;

    @ManyToOne(() => RouteWaypointEntity)
    @JoinColumn({ name: 'end_waypoint_id' })
    endWaypoint: RouteWaypointEntity;

    @Column({ name: 'seat_id', type: 'varchar', length: 10 })
    seatId: string;

    @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 })
    totalPrice: number;

    @Column({ name: 'payment_status', type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING_CASH })
    paymentStatus: PaymentStatus;

    @Column({ name: 'payment_method', type: 'varchar', length: 50, nullable: true })
    paymentMethod: string;

    @Column({ name: 'payment_gateway_ref', type: 'varchar', length: 150, nullable: true })
    paymentGatewayRef: string;

    // Referencia al cargo de Culqi (para reembolsos y trazabilidad)
    @Column({ name: 'culqi_charge_id', type: 'varchar', length: 100, nullable: true })
    culqiChargeId: string | null;

    // Usuario que realizó la reserva (para pagos con billetera)
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'user_id' })
    user: UserEntity | null;

    // Precio de la reserva (alias de totalPrice para compatibilidad)
    get price(): number {
        return Number(this.totalPrice);
    }

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
    deletedAt: Date | null;
}

