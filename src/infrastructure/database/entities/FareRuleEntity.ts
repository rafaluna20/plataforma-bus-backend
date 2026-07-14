import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RouteEntity } from './RouteEntity';

export enum FareRuleType {
    /** Franja horaria (ej. "noche 19:00-23:59"), opcionalmente limitada a ciertos días de la semana. */
    TIME_BAND = 'TIME_BAND',
    /** Fecha o rango de fechas específico (feriados, temporada alta). Tiene prioridad sobre TIME_BAND. */
    SPECIFIC_DATE = 'SPECIFIC_DATE',
}

/**
 * Regla de ajuste de tarifa por ruta. El precio final de un tramo es
 * `precio_base_del_tramo * priceMultiplier` de la regla que aplique a la
 * hora/fecha de salida del viaje (hora de Perú). Sin reglas o sin match,
 * el multiplicador es 1 (precio base sin cambios) — retrocompatible.
 */
@Entity('fare_rules')
export class FareRuleEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => RouteEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'route_id' })
    route: RouteEntity;

    /** Nombre descriptivo para el panel admin (ej. "Tarifa nocturna", "Año Nuevo"). */
    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'enum', enum: FareRuleType, name: 'rule_type' })
    ruleType: FareRuleType;

    // ─── TIME_BAND ──────────────────────────────────────────────────────────
    /** Hora de inicio "HH:mm", hora de Perú. */
    @Column({ name: 'start_time', type: 'varchar', length: 5, nullable: true })
    startTime: string | null;

    /** Hora de fin "HH:mm", hora de Perú. Si es menor a startTime, el rango cruza medianoche. */
    @Column({ name: 'end_time', type: 'varchar', length: 5, nullable: true })
    endTime: string | null;

    /** Días de la semana (0=domingo…6=sábado) a los que aplica. null = todos los días. */
    @Column({ name: 'days_of_week', type: 'simple-array', nullable: true })
    daysOfWeek: number[] | null;

    // ─── SPECIFIC_DATE ──────────────────────────────────────────────────────
    /** Fecha de inicio "YYYY-MM-DD", hora de Perú. */
    @Column({ name: 'start_date', type: 'date', nullable: true })
    startDate: string | null;

    /** Fecha de fin "YYYY-MM-DD" (inclusive). Si es null, se usa startDate (un solo día). */
    @Column({ name: 'end_date', type: 'date', nullable: true })
    endDate: string | null;

    // ─── Ajuste ─────────────────────────────────────────────────────────────
    /** Multiplicador aplicado al precio base del tramo (1 = sin cambio, 1.2 = +20%, 0.8 = -20%). */
    @Column({ name: 'price_multiplier', type: 'decimal', precision: 6, scale: 4 })
    priceMultiplier: number;

    /** Si dos reglas coinciden, gana la de mayor prioridad; a igual prioridad, SPECIFIC_DATE gana sobre TIME_BAND. */
    @Column({ type: 'int', default: 0 })
    priority: number;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt: Date;
}
