import { AppDataSource } from '../../infrastructure/database/data-source';
import { FareRuleEntity, FareRuleType } from '../../infrastructure/database/entities/FareRuleEntity';
import { RouteEntity } from '../../infrastructure/database/entities/RouteEntity';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { assertSameCompany } from '../../infrastructure/auth/companyScope';

/** Perú no usa horario de verano — offset fijo. */
const PERU_UTC_OFFSET_HOURS = -5;

export interface CreateFareRuleDTO {
    routeId: string;
    name: string;
    ruleType: FareRuleType;
    startTime?: string | null;
    endTime?: string | null;
    daysOfWeek?: number[] | null;
    startDate?: string | null;
    endDate?: string | null;
    priceMultiplier: number;
    priority?: number;
    actorRole?: UserRole;
    actorCompanyId?: string;
}

export interface UpdateFareRuleDTO {
    name?: string;
    startTime?: string | null;
    endTime?: string | null;
    daysOfWeek?: number[] | null;
    startDate?: string | null;
    endDate?: string | null;
    priceMultiplier?: number;
    priority?: number;
    isActive?: boolean;
}

function timeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Descompone una fecha (UTC) a sus componentes de hora local de Perú. */
function toPeruLocal(date: Date): { minutesOfDay: number; dayOfWeek: number; dateStr: string } {
    const peru = new Date(date.getTime() + PERU_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    return {
        minutesOfDay: peru.getUTCHours() * 60 + peru.getUTCMinutes(),
        dayOfWeek: peru.getUTCDay(), // 0=domingo … 6=sábado
        dateStr: peru.toISOString().slice(0, 10), // YYYY-MM-DD
    };
}

export class FareRuleService {
    private get repo() {
        return AppDataSource.getRepository(FareRuleEntity);
    }
    private get routeRepo() {
        return AppDataSource.getRepository(RouteEntity);
    }

    public async create(data: CreateFareRuleDTO): Promise<FareRuleEntity> {
        const route = await this.routeRepo.findOne({ where: { id: data.routeId }, relations: { company: true } });
        if (!route) throw new Error('Ruta no encontrada');
        assertSameCompany(data.actorRole, data.actorCompanyId, route.company.id);

        if (data.ruleType === FareRuleType.TIME_BAND && (!data.startTime || !data.endTime)) {
            throw new Error('Las reglas por franja horaria requieren startTime y endTime');
        }
        if (data.ruleType === FareRuleType.SPECIFIC_DATE && !data.startDate) {
            throw new Error('Las reglas por fecha específica requieren startDate');
        }
        if (!data.priceMultiplier || data.priceMultiplier <= 0) {
            throw new Error('priceMultiplier debe ser mayor a 0');
        }

        const rule = this.repo.create({
            route,
            name: data.name,
            ruleType: data.ruleType,
            startTime: data.startTime ?? null,
            endTime: data.endTime ?? null,
            daysOfWeek: data.daysOfWeek?.length ? data.daysOfWeek : null,
            startDate: data.startDate ?? null,
            endDate: data.endDate ?? data.startDate ?? null,
            priceMultiplier: data.priceMultiplier,
            priority: data.priority ?? 0,
            isActive: true,
        });
        return this.repo.save(rule);
    }

    public async listByRoute(routeId: string, actorRole?: UserRole, actorCompanyId?: string): Promise<FareRuleEntity[]> {
        const route = await this.routeRepo.findOne({ where: { id: routeId }, relations: { company: true } });
        if (!route) throw new Error('Ruta no encontrada');
        assertSameCompany(actorRole, actorCompanyId, route.company.id);

        return this.repo.find({ where: { route: { id: routeId } }, order: { priority: 'DESC', createdAt: 'DESC' } });
    }

    public async update(id: string, data: UpdateFareRuleDTO, actorRole?: UserRole, actorCompanyId?: string): Promise<FareRuleEntity> {
        const rule = await this.repo.findOne({ where: { id }, relations: { route: { company: true } } });
        if (!rule) throw new Error('Regla de tarifa no encontrada');
        assertSameCompany(actorRole, actorCompanyId, rule.route.company.id);

        if (data.name !== undefined) rule.name = data.name;
        if (data.startTime !== undefined) rule.startTime = data.startTime;
        if (data.endTime !== undefined) rule.endTime = data.endTime;
        if (data.daysOfWeek !== undefined) rule.daysOfWeek = data.daysOfWeek?.length ? data.daysOfWeek : null;
        if (data.startDate !== undefined) rule.startDate = data.startDate;
        if (data.endDate !== undefined) rule.endDate = data.endDate;
        if (data.priceMultiplier !== undefined) rule.priceMultiplier = data.priceMultiplier;
        if (data.priority !== undefined) rule.priority = data.priority;
        if (data.isActive !== undefined) rule.isActive = data.isActive;

        return this.repo.save(rule);
    }

    public async delete(id: string, actorRole?: UserRole, actorCompanyId?: string): Promise<void> {
        const rule = await this.repo.findOne({ where: { id }, relations: { route: { company: true } } });
        if (!rule) throw new Error('Regla de tarifa no encontrada');
        assertSameCompany(actorRole, actorCompanyId, rule.route.company.id);

        await this.repo.remove(rule);
    }

    /**
     * Multiplicador de precio activo para una ruta a la hora/fecha de salida
     * dada (hora de Perú). 1 = sin ajuste (sin reglas o ninguna coincide).
     */
    public async getMultiplier(routeId: string, departureTime: Date | string): Promise<number> {
        const rules = await this.repo.find({ where: { route: { id: routeId }, isActive: true } });
        if (rules.length === 0) return 1;

        // departureTime puede llegar como string (ej. tras un round-trip por
        // caché Redis, que serializa/deserializa Date a ISO string).
        const { minutesOfDay, dayOfWeek, dateStr } = toPeruLocal(new Date(departureTime));

        const matches = rules.filter(r => {
            if (r.ruleType === FareRuleType.SPECIFIC_DATE) {
                if (!r.startDate) return false;
                return dateStr >= r.startDate && dateStr <= (r.endDate || r.startDate);
            }
            // TIME_BAND
            if (!r.startTime || !r.endTime) return false;
            if (r.daysOfWeek && r.daysOfWeek.length > 0 && !r.daysOfWeek.includes(dayOfWeek)) return false;
            const startMin = timeToMinutes(r.startTime);
            const endMin = timeToMinutes(r.endTime);
            if (startMin <= endMin) {
                return minutesOfDay >= startMin && minutesOfDay < endMin;
            }
            // Rango que cruza medianoche (ej. 22:00 - 05:00)
            return minutesOfDay >= startMin || minutesOfDay < endMin;
        });

        if (matches.length === 0) return 1;

        matches.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            if (a.ruleType !== b.ruleType) return a.ruleType === FareRuleType.SPECIFIC_DATE ? -1 : 1;
            return 0;
        });

        return Number(matches[0].priceMultiplier);
    }

    /**
     * Aplica el multiplicador activo a un arreglo de waypoints (sin mutar los
     * originales) — usado para que el detalle/búsqueda de viajes muestre el
     * precio ya ajustado, sin duplicar la lógica de cálculo en el frontend.
     */
    public async applyToWaypoints<T extends { basePrice: any; basePriceFloor1: any }>(
        routeId: string,
        departureTime: Date | string,
        waypoints: T[],
    ): Promise<T[]> {
        const multiplier = await this.getMultiplier(routeId, departureTime);
        if (multiplier === 1) return waypoints;

        return waypoints.map(wp => ({
            ...wp,
            basePrice: round2(Number(wp.basePrice) * multiplier),
            basePriceFloor1: wp.basePriceFloor1 != null ? round2(Number(wp.basePriceFloor1) * multiplier) : null,
        }));
    }
}
