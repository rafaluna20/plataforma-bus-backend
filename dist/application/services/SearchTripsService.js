"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchTripsService = void 0;
const data_source_1 = require("../../infrastructure/database/data-source");
const TripEntity_1 = require("../../infrastructure/database/entities/TripEntity");
const RedisCache_1 = require("../../infrastructure/cache/RedisCache");
class SearchTripsService {
    /**
     * Busca viajes programados que pasen por el origen y destino en el orden correcto
     * y en la fecha solicitada. Usa SQL con JOINs en lugar de filtrado en memoria.
     */
    async execute(params) {
        const { originCity, destinationCity, travelDate } = params;
        const page = Math.max(1, params.page || 1);
        const limit = Math.min(50, Math.max(1, params.limit || 15));
        const skip = (page - 1) * limit;
        const tripRepository = data_source_1.AppDataSource.getRepository(TripEntity_1.TripEntity);
        // Intentar obtener del caché si hay parámetros de búsqueda completos
        if (originCity && destinationCity && travelDate) {
            const dateStr = travelDate.toISOString().split('T')[0];
            const cacheKey = RedisCache_1.CacheKeys.tripSearch(originCity, destinationCity, dateStr, page, limit);
            const cached = await RedisCache_1.cache.get(cacheKey);
            if (cached) {
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
                statuses: [TripEntity_1.TripStatus.SCHEDULED, TripEntity_1.TripStatus.BOARDING],
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
            statuses: [TripEntity_1.TripStatus.SCHEDULED, TripEntity_1.TripStatus.BOARDING],
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
        // Guardar en caché por 5 minutos
        const dateStr = travelDate.toISOString().split('T')[0];
        const cacheKey = RedisCache_1.CacheKeys.tripSearch(originCity, destinationCity, dateStr, page, limit);
        await RedisCache_1.cache.set(cacheKey, result, RedisCache_1.CacheTTL.TRIP_SEARCH);
        return result;
    }
}
exports.SearchTripsService = SearchTripsService;
//# sourceMappingURL=SearchTripsService.js.map