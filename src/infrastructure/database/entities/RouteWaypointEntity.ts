import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { RouteEntity } from './RouteEntity';
import { StationEntity } from './StationEntity';

@Entity('route_waypoints')
@Unique(['route', 'stopOrder'])
export class RouteWaypointEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => RouteEntity, route => route.waypoints, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'route_id' })
    route: RouteEntity;

    @ManyToOne(() => StationEntity)
    @JoinColumn({ name: 'station_id' })
    station: StationEntity;

    @Column({ name: 'stop_order', type: 'int' })
    stopOrder: number;

    @Column({ name: 'estimated_duration_mins', type: 'int', default: 0 })
    estimatedDurationMins: number;

    @Column({ name: 'base_price', type: 'decimal', precision: 10, scale: 2, default: 0.00 })
    basePrice: number;

    /**
     * Precio del primer piso (BUS_2P). Si es null se usa basePrice como fallback.
     * El Piso 1 suele ser el piso de abajo con asientos tipo cama/VIP.
     */
    @Column({ name: 'base_price_floor1', type: 'decimal', precision: 10, scale: 2, nullable: true, default: null })
    basePriceFloor1: number | null;
}
