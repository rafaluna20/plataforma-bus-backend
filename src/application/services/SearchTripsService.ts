import { AppDataSource } from '../../infrastructure/database/data-source';
import { TripEntity, TripStatus } from '../../infrastructure/database/entities/TripEntity';
import { BookingEntity, PaymentStatus } from '../../infrastructure/database/entities/BookingEntity';
import { cache, CacheKeys, CacheTTL } from '../../infrastructure/cache/RedisCache';

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
            const capacity = trip.vehicle?.capacity || 0;
            (trip as any).availableSeats = Math.max(0, capacity - occupied);
        });

        return trips;
    }

    /**
     * Busca viajes programados que pasen por el origen y destino en el orden correcto
     * y en la fecha solicitada. Usa SQL con JOINs en lugar de filtrado en memoria.
     */
    public async execute(params: SearchTripsDTO) {
        const { originCity, destinationCity, travelDate } = params;
        const page = Math.max(1, params.page || 1);
        const limit = Math.min(50, Math.max(1, params.limit || 15));
        const skip = (page - 1) * limit;

        const tripRepository = AppDataSource.getRepository(TripEntity);

        // Intentar obtener del caché si hay parámetros de búsqueda completos
        if (originCity && destinationCity && travelDate) {
            const dateStr = travelDate.toISOString().split('T')[0];
            const cacheKey = CacheKeys.tripSearch(originCity, destinationCity, dateStr, page, limit);
            const cached = await cache.get<SearchTripsResult>(cacheKey);
            if (cached) {
                // Los asientos disponibles se recalculan siempre en vivo (no se cachean)
                // para reflejar las reservas más recientes.
                cached.data = await this.attachAvailableSeats(cached.data);
                return cached;
            }
        }

        // Si no hay parámetros de búsqueda, retornar los próximos viajes disponibles
        // (opcionalmente filtrados por empresa y/o tipo de vehículo)
        if (!originCity || !destinationCity || !travelDate) {
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
                .andWhere('trip.departure_time >= :now', { now: new Date() })
                .orderBy('trip.departure_time', 'ASC')
                .skip(skip)
                .take(limit);

            // Filtro por empresa
            if (params.companyId) {
                qb.andWhere('company.id = :companyId', { companyId: params.companyId });
            }

            // Filtro por tipo de vehículo
            if (params.vehicleType) {
                qb.andWhere('vehicle.vehicle_type = :vehicleType', { vehicleType: params.vehicleType });
            }

            const [trips, total] = await qb.getManyAndCount();

            trips.forEach(trip => {
                if (trip.route?.waypoints) {
                    trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
                }
            });

            await this.attachAvailableSeats(trips);

            return {
                data: trips,
                total,
                page,
                totalPages: Math.ceil(total / limit),
            };
        }

        // Determinar inicio y fin del día para la búsqueda
        const startOfDay = new Date(travelDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(travelDate);
        endOfDay.setHours(23, 59, 59, 999);

        /**
         * CORRECCIÓN: Búsqueda con SQL usando doble JOIN a route_waypoints.
         * Esto evita cargar todos los viajes en memoria y filtrar en Node.js.
         *
         * La query verifica que:
         * 1. Exista un waypoint de ORIGEN con la ciudad solicitada
         * 2. Exista un waypoint de DESTINO con la ciudad solicitada
         * 3. El stop_order del origen sea MENOR que el del destino (dirección correcta)
         */
        const query = tripRepository
            .createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('route.company', 'company')
            .innerJoinAndSelect('route.waypoints', 'allWaypoints')
            .innerJoinAndSelect('allWaypoints.station', 'allStations')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            // JOIN para el waypoint de ORIGEN
            .innerJoin('route.waypoints', 'originWp')
            .innerJoin('originWp.station', 'originStation')
            // JOIN para el waypoint de DESTINO
            .innerJoin('route.waypoints', 'destWp')
            .innerJoin('destWp.station', 'destStation')
            // Filtros de búsqueda
            .where('trip.status IN (:...statuses)', {
                statuses: [TripStatus.SCHEDULED, TripStatus.BOARDING],
            })
            .andWhere('trip.departure_time BETWEEN :startOfDay AND :endOfDay', {
                startOfDay,
                endOfDay,
            })
            .andWhere('LOWER(originStation.city) = LOWER(:originCity)', { originCity })
            .andWhere('LOWER(destStation.city) = LOWER(:destinationCity)', { destinationCity })
            // Garantizar que el origen esté ANTES que el destino en la ruta
            .andWhere('originWp.stop_order < destWp.stop_order')
            .orderBy('trip.departure_time', 'ASC')
            .skip(skip)
            .take(limit);

        const [trips, total] = await query.getManyAndCount();

        // Ordenar waypoints por stop_order en cada viaje
        trips.forEach(trip => {
            if (trip.route?.waypoints) {
                trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
            }
        });

        const result = {
            data: trips,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            searchParams: { originCity, destinationCity, travelDate },
        };

        // Guardar en caché por 5 minutos (sin asientos disponibles: se calculan siempre en vivo)
        const dateStr = travelDate.toISOString().split('T')[0];
        const cacheKey = CacheKeys.tripSearch(originCity, destinationCity, dateStr, page, limit);
        await cache.set(cacheKey, result, CacheTTL.TRIP_SEARCH);

        await this.attachAvailableSeats(trips);

        return result;
    }
}
