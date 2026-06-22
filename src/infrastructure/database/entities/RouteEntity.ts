import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CompanyEntity } from './CompanyEntity';
import { ServiceMode } from './VehicleEntity';
import { RouteWaypointEntity } from './RouteWaypointEntity';

@Entity('routes')
export class RouteEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'enum', enum: ServiceMode, name: 'service_mode' })
    serviceMode: ServiceMode;

    @Column({ type: 'text', nullable: true })
    polyline: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;

    @OneToMany(() => RouteWaypointEntity, waypoint => waypoint.route)
    waypoints: RouteWaypointEntity[];
}
