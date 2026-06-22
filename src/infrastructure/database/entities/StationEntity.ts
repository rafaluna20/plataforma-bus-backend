import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CompanyEntity } from './CompanyEntity';

@Entity('stations')
@Index('idx_stations_location', ['location'], { spatial: true })
export class StationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => CompanyEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity | null;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'text', nullable: true })
    address: string;

    @Column({ type: 'varchar', length: 50 })
    city: string;

    @Column({
        type: 'geometry',
        spatialFeatureType: 'Point',
        srid: 4326,
    })
    location: string; // TypeORM maps PostGIS geometry to string by default or specific types

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;
}
