import { AppDataSource } from '../../../infrastructure/database/data-source';
import { TripEntity, TripStatus } from '../domain/TripEntity';
import { BookingEntity, PaymentStatus } from '../../../infrastructure/database/entities/BookingEntity';
import { cache, CacheKeys, CacheTTL } from '../../../infrastructure/cache/RedisCache';

export interface SearchTripsDTO {
    originCity?: string;
    destinationCity?: string;
    travelDate?: Date;
    companyId?: string;
    vehicleType?: string;
    page?: number;
    limit?: number;
}

export interface SearchTripsResult {
    data: TripEntity[];
    total: number;
    page: number;
    totalPages: number;
    searchParams?: { originCity: string; destinationCity: string; travelDate: Date };
}

export class SearchTripsService {
    /**
     * Capacidad efectiva de un vehículo: el seatTemplate es la fuente de verdad de qué
     * asientos se renderizan/venden realmente. vehicle.capacity es una columna separada
     * que puede quedar desincronizada si se editó a mano en el formulario de vehículos,
     * así que solo se usa como fallback cuando no hay template.
     */
    private getEffectiveCapacity(vehicle: any): number {
        const st = vehicle?.seatTemplate;
        if (!st) return vehicle?.capacity || 0;
        if (typeof st.totalSeats === 'number' && st.totalSeats > 0) return st.totalSeats;
        const raw = Array.isArray(st) ? st : (st.seats ?? []);
        const activeCount = raw.filter((s: any) => s.active !== false).length;
        return activeCount > 0 ? activeCount : (vehicle?.capacity || 0);
    }

    /**
     * Calcula asientos disponibles por viaje (capacidad - asientos distintos con reserva activa)
     * y los adjunta como trip.availableSeats. Se ejecuta fuera del caché de búsqueda para que
     * el conteo de asientos siempre refleje las reservas más recientes.
     */
    private async attachAvailableSeats(trips: TripEntity[]): Promise<TripEntity[]> {
        if (trips.length === 0) return trips;

        const tripIds = trips.map(t => t.id);
        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const activeStatuses = [
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PENDING_DIGITAL,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];

        const occupancy = await bookingRepo
            .createQueryBuilder('b')
            .select('b.trip_id', 'tripId')
            .addSelect('COUNT(DISTINCT b.seat_id)', 'occupied')
            .where('b.trip_id IN (:...tripIds)', { tripIds })
            .andWhere('b.payment_status IN (:...activeStatuses)', { activeStatuses })
            .groupBy('b.trip_id')
            .getRawMany();

        const occupiedByTripId = new Map<string, number>(
            occupancy.map((row: any) => [row.tripId, parseInt(row.occupied, 10)])
        );

        trips.forEach(trip => {
            const occupied = occupiedByTripId.get(trip.id) || 0;
            const capacity = this.getEffectiveCapacity(trip.vehicle);
            (trip as any).availableSeats = Math.max(0, capacity - occupied);
        });

        return trips;
    }

    /**
     * Busca viajes programados, filtrando por origen/destino y/o fecha de forma
     * independiente entre sí: cada filtro se aplica si está presente, sin exigir
     * que los tres (origen + destino + fecha) vengan juntos.
     */
    public async execute(params: SearchTripsDTO) {
        const { originCity, destinationCity, travelDate } = params;
        const page = Math.max(1, params.page || 1);
        const limit = Math.min(50, Math.max(1, params.limit || 15));
        const skip = (page - 1) * limit;

        const tripRepository = AppDataSource.getRepository(TripEntity);
        const hasRouteFilter = !!(originCity && destinationCity);

        // El caché solo aplica a búsquedas completas (origen + destino + fecha)
        if (hasRouteFilter && travelDate) {
            const dateStr = travelDate.toISOString().split('T')[0];
            const cacheKey = CacheKeys.tripSearch(originCity!, destinationCity!, dateStr, page, limit);
            const cached = await cache.get<SearchTripsResult>(cacheKey);
            if (cached) {
                // Los asientos disponibles se recalculan siempre en vivo (no se cachean)
                // para reflejar las reservas más recientes.
                cached.data = await this.attachAvailableSeats(cached.data);
                return cached;
            }
        }

        const qb = tripRepository
            .createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('route.company', 'company')
            .innerJoinAndSelect('route.waypoints', 'allWaypoints')
            .innerJoinAndSelect('allWaypoints.station', 'allStations')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            .where('trip.status IN (:...statuses)', {
                statuses: [TripStatus.SCHEDULED, TripStatus.BOARDING],
            })
            .orderBy('trip.departure_time', 'ASC')
            .skip(skip)
            .take(limit);

        if (travelDate) {
            const startOfDay = new Date(travelDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(travelDate);
            endOfDay.setHours(23, 59, 59, 999);
            qb.andWhere('trip.departure_time BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay });
        } else {
            qb.andWhere('trip.departure_time >= :now', { now: new Date() });
        }

        if (hasRouteFilter) {
            /**
             * Doble JOIN a route_waypoints: verifica que exista un waypoint de ORIGEN
             * con la ciudad solicitada, uno de DESTINO con la ciudad solicitada, y que
             * el stop_order del origen sea MENOR que el del destino (dirección correcta).
             */
            qb.innerJoin('route.waypoints', 'originWp')
                .innerJoin('originWp.station', 'originStation')
                .innerJoin('route.waypoints', 'destWp')
                .innerJoin('destWp.station', 'destStation')
                .andWhere('LOWER(originStation.city) = LOWER(:originCity)', { originCity })
                .andWhere('LOWER(destStation.city) = LOWER(:destinationCity)', { destinationCity })
                .andWhere('originWp.stop_order < destWp.stop_order');
        }

        // Filtro por empresa
        if (params.companyId) {
            qb.andWhere('company.id = :companyId', { companyId: params.companyId });
        }

        // Filtro por tipo de vehículo
        if (params.vehicleType) {
            qb.andWhere('vehicle.vehicle_type = :vehicleType', { vehicleType: params.vehicleType });
        }

        const [trips, total] = await qb.getManyAndCount();

        // Ordenar waypoints por stop_order en cada viaje
        trips.forEach(trip => {
            if (trip.route?.waypoints) {
                trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
            }
        });

        await this.attachAvailableSeats(trips);

        const result: SearchTripsResult = {
            data: trips,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            ...(hasRouteFilter && travelDate
                ? { searchParams: { originCity: originCity!, destinationCity: destinationCity!, travelDate } }
                : {}),
        };

        // Guardar en caché por 5 minutos solo para búsquedas completas (origen + destino + fecha)
        if (hasRouteFilter && travelDate) {
            const dateStr = travelDate.toISOString().split('T')[0];
            const cacheKey = CacheKeys.tripSearch(originCity!, destinationCity!, dateStr, page, limit);
            await cache.set(cacheKey, result, CacheTTL.TRIP_SEARCH);
        }

        return result;
    }
}
