import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid', nullable: true })
    userId: string | null;

    @Column({ name: 'user_email', type: 'varchar', length: 255, nullable: true })
    userEmail: string | null;

    @Column({ type: 'varchar', length: 100 })
    action: string; // e.g., 'CREATE_VEHICLE', 'UPDATE_ROUTE', 'DELETE_VEHICLE', 'CANCEL_BOOKING'

    @Column({ name: 'entity_name', type: 'varchar', length: 100, nullable: true })
    entityName: string | null; // e.g., 'VehicleEntity'

    @Column({ name: 'entity_id', type: 'varchar', length: 100, nullable: true })
    entityId: string | null;

    @Column({ name: 'old_value', type: 'jsonb', nullable: true })
    oldValue: any | null;

    @Column({ name: 'new_value', type: 'jsonb', nullable: true })
    newValue: any | null;

    @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
    ipAddress: string | null;

    @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
    userAgent: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;
}
