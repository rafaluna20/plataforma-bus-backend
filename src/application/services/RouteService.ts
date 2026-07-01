import { AppDataSource } from '../../infrastructure/database/data-source';
import { RouteEntity } from '../../infrastructure/database/entities/RouteEntity';
import { RouteWaypointEntity } from '../../infrastructure/database/entities/RouteWaypointEntity';
import { StationEntity } from '../../infrastructure/database/entities/StationEntity';
import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
import { ServiceMode } from '../../infrastructure/database/entities/VehicleEntity';
import { BookingEntity } from '../../infrastructure/database/entities/BookingEntity';

export interface CreateStationDTO {
    companyId?: string;
    name: string;
    address?: string;
    city: string;
    latitude: number;
    longitude: number;
}

export interface WaypointInput {
    id?: string;           // presente al editar; ausente al crear nuevas paradas
    stationId: string;
    stopOrder: number;
    estimatedDurationMins: number;
    basePrice: number;
    basePriceFloor1?: number | null; // Precio piso 1 para BUS_2P (null = usar basePrice)
}

export interface CreateRouteDTO {
    companyId: string;
    name: string;
    serviceMode: ServiceMode;
    polyline?: string;
    waypoints: WaypointInput[];
}

export class RouteService {
    private get routeRepo() {
        return AppDataSource.getRepository(RouteEntity);
    }
    private get waypointRepo() {
        return AppDataSource.getRepository(RouteWaypointEntity);
    }
    private get stationRepo() {
        return AppDataSource.getRepository(StationEntity);
    }
    private get companyRepo() {
        return AppDataSource.getRepository(CompanyEntity);
    }

    // ==================== ESTACIONES / PARADEROS ====================

    /** Crear un paradero o agencia con coordenadas geográficas */
    public async createStation(data: CreateStationDTO): Promise<StationEntity> {
        let company: CompanyEntity | null = null;
        if (data.companyId) {
            company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company) throw new Error('Empresa no encontrada');
        }

        const station = this.stationRepo.create({
            company,
            name: data.name,
            address: data.address,
            city: data.city,
            // PostGIS: Crear punto geográfico con ST_SetSRID(ST_MakePoint(lng, lat), 4326)
            location: () => `ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)`,
        } as any);

        return this.stationRepo.save(station) as unknown as StationEntity;
    }

    /** Listar paraderos por ciudad */
    public async findStationsByCity(city: string): Promise<StationEntity[]> {
        return this.stationRepo.find({
            where: { city, isActive: true },
            order: { name: 'ASC' },
        });
    }

    /** Listar todos los paraderos activos (sin filtro de ciudad) */
    public async findAllStations(): Promise<StationEntity[]> {
        return this.stationRepo.find({
            where: { isActive: true },
            order: { city: 'ASC', name: 'ASC' },
        });
    }

    /** Actualizar nombre, ciudad, dirección y coordenadas de una estación */
    public async updateStation(
        id: string,
        data: { name: string; city: string; address?: string; latitude?: number; longitude?: number }
    ): Promise<StationEntity> {
        const station = await this.stationRepo.findOne({ where: { id } });
        if (!station) throw new Error(`Estación con ID ${id} no encontrada`);

        station.name = data.name;
        station.city = data.city;
        if (data.address !== undefined) station.address = data.address;

        if (data.latitude !== undefined && data.longitude !== undefined) {
            // Actualizar coordenadas PostGIS
            await this.stationRepo.query(
                `UPDATE station SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
                [data.longitude, data.latitude, id]
            );
        }

        return this.stationRepo.save(station);
    }

    /** Desactivar (soft-delete) una estación — verifica que no esté en uso en rutas activas */
    public async deleteStation(id: string): Promise<void> {
        const station = await this.stationRepo.findOne({ where: { id } });
        if (!station) throw new Error(`Estación con ID ${id} no encontrada`);

        // Verificar si la estación está en uso en algún waypoint
        const waypointCount = await this.waypointRepo.count({ where: { station: { id } } });
        if (waypointCount > 0) {
            throw new Error(
                `La estación "${station.name}" está en uso en ${waypointCount} ruta(s). Elimínala de las rutas primero.`
            );
        }

        station.isActive = false;
        await this.stationRepo.save(station);
    }

    // ==================== RUTAS Y WAYPOINTS ====================

    /** Crear una ruta completa con sus paradas intermedias (waypoints) */
    public async createRoute(data: CreateRouteDTO): Promise<RouteEntity> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company) throw new Error('Empresa no encontrada');

            // Validar que haya al menos 2 paradas (Origen y Destino)
            if (!data.waypoints || data.waypoints.length < 2) {
                throw new Error('Una ruta debe tener al menos 2 paradas (Origen y Destino)');
            }

            // Validar orden secuencial de los waypoints
            const sortedWaypoints = [...data.waypoints].sort((a, b) => a.stopOrder - b.stopOrder);
            for (let i = 0; i < sortedWaypoints.length; i++) {
                if (sortedWaypoints[i].stopOrder !== i + 1) {
                    throw new Error(`Los waypoints deben ser secuenciales. Falta el orden ${i + 1}`);
                }
            }

            // Crear la ruta base
            const route = queryRunner.manager.create(RouteEntity, {
                company,
                name: data.name,
                serviceMode: data.serviceMode as unknown as ServiceMode,
                polyline: data.polyline || null,
            });
            const savedRoute = await queryRunner.manager.save(route);

            // Crear cada waypoint asociado a la ruta
            for (const wp of sortedWaypoints) {
                const station = await this.stationRepo.findOne({ where: { id: wp.stationId } });
                if (!station) throw new Error(`Estación con ID ${wp.stationId} no encontrada`);

                const waypoint = queryRunner.manager.create(RouteWaypointEntity, {
                    route: savedRoute,
                    station,
                    stopOrder: wp.stopOrder,
                    estimatedDurationMins: wp.estimatedDurationMins,
                    basePrice: wp.basePrice,
                    basePriceFloor1: wp.basePriceFloor1 ?? null,
                });
                await queryRunner.manager.save(waypoint);
            }

            await queryRunner.commitTransaction();

            // Retornar la ruta con sus waypoints cargados
            return this.routeRepo.findOne({
                where: { id: savedRoute.id },
                relations: { waypoints: { station: true }, company: true },
            }) as Promise<RouteEntity>;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /** Listar rutas de una empresa */
    public async findByCompany(companyId: string): Promise<RouteEntity[]> {
        return this.routeRepo.find({
            where: { company: { id: companyId } },
            relations: { waypoints: { station: true } },
            order: { name: 'ASC' },
        });
    }

    /** Obtener una ruta por ID con todos sus waypoints */
    public async findById(id: string): Promise<RouteEntity> {
        const route = await this.routeRepo.findOne({
            where: { id },
            relations: { waypoints: { station: true }, company: true },
        });
        if (!route) throw new Error('Ruta no encontrada');

        // Ordenar waypoints por stop_order
        if (route.waypoints) {
            route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
        }
        return route;
    }

    /** Actualizar una ruta y sus waypoints con upsert inteligente.
     *
     * Reglas de negocio:
     *  - Si un waypoint llega con `id`, se actualiza en-lugar (precio, duración, orden).
     *  - Si el `id` existe pero se intenta cambiar la `stationId` y ese waypoint
     *    ya tiene reservas, se lanza un error amigable en lugar de romper la FK.
     *  - Si un waypoint llega SIN `id`, se crea como nuevo.
     *  - Waypoints existentes cuyo `id` NO viene en el payload se eliminan SOLO
     *    si no tienen reservas; si las tienen, también se lanza error amigable.
     */
    public async updateRoute(id: string, data: Partial<CreateRouteDTO>): Promise<RouteEntity> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const route = await queryRunner.manager.findOne(RouteEntity, {
                where: { id },
                relations: { waypoints: { station: true } },
            });
            if (!route) throw new Error('Ruta no encontrada');

            if (data.name) route.name = data.name;
            if (data.serviceMode) route.serviceMode = data.serviceMode as unknown as ServiceMode;
            if (data.polyline !== undefined) route.polyline = data.polyline || '';
            await queryRunner.manager.save(route);

            if (data.waypoints && data.waypoints.length > 0) {
                if (data.waypoints.length < 2) {
                    throw new Error('Una ruta debe tener al menos 2 paradas (Origen y Destino)');
                }

                const sortedWaypoints = [...data.waypoints].sort((a, b) => a.stopOrder - b.stopOrder);
                for (let i = 0; i < sortedWaypoints.length; i++) {
                    if (sortedWaypoints[i].stopOrder !== i + 1) {
                        throw new Error(`Los waypoints deben ser secuenciales. Falta el orden ${i + 1}`);
                    }
                }

                const existingWps = route.waypoints || [];
                const incomingIds = new Set(sortedWaypoints.filter(w => w.id).map(w => w.id!));
                const bookingRepo = queryRunner.manager.getRepository(BookingEntity);

                // ── 1. Eliminar waypoints removidos del payload ─────────────────
                for (const existing of existingWps) {
                    if (!incomingIds.has(existing.id)) {
                        // Verificar si tiene reservas antes de eliminar
                        const bookingCount = await bookingRepo.count({
                            where: [
                                { startWaypoint: { id: existing.id } },
                                { endWaypoint: { id: existing.id } },
                            ],
                        });
                        if (bookingCount > 0) {
                            const stName = existing.station?.name || existing.id;
                            throw new Error(
                                `No se puede eliminar la parada "${stName}" porque tiene ${bookingCount} pasaje(s) vendido(s). Cancela esas reservas primero.`
                            );
                        }
                        await queryRunner.manager.remove(RouteWaypointEntity, existing);
                    }
                }

                // ── 2. Actualizar o crear cada waypoint del payload ─────────────
                for (const wp of sortedWaypoints) {
                    const station = await this.stationRepo.findOne({ where: { id: wp.stationId } });
                    if (!station) throw new Error(`Estación con ID ${wp.stationId} no encontrada`);

                    if (wp.id) {
                        // Editar waypoint existente
                        const existing = existingWps.find(e => e.id === wp.id);
                        if (!existing) throw new Error(`Waypoint con ID ${wp.id} no encontrado en esta ruta`);

                        // Si cambia la estación, verificar que no tenga reservas
                        if (existing.station?.id !== wp.stationId) {
                            const bookingCount = await bookingRepo.count({
                                where: [
                                    { startWaypoint: { id: wp.id } },
                                    { endWaypoint: { id: wp.id } },
                                ],
                            });
                            if (bookingCount > 0) {
                                throw new Error(
                                    `No se puede cambiar la estación de la parada "${existing.station?.name}" porque tiene ${bookingCount} pasaje(s) vendido(s).`
                                );
                            }
                        }

                        existing.station = station;
                        existing.stopOrder = wp.stopOrder;
                        existing.estimatedDurationMins = wp.estimatedDurationMins;
                        existing.basePrice = wp.basePrice;
                        existing.basePriceFloor1 = wp.basePriceFloor1 ?? null;
                        await queryRunner.manager.save(existing);
                    } else {
                        // Crear waypoint nuevo
                        const newWp = queryRunner.manager.create(RouteWaypointEntity, {
                            route,
                            station,
                            stopOrder: wp.stopOrder,
                            estimatedDurationMins: wp.estimatedDurationMins,
                            basePrice: wp.basePrice,
                            basePriceFloor1: wp.basePriceFloor1 ?? null,
                        });
                        await queryRunner.manager.save(newWp);
                    }
                }
            }

            await queryRunner.commitTransaction();
            return this.findById(id);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /** Eliminar una ruta (Soft Delete) */
    public async deleteRoute(id: string): Promise<RouteEntity> {
        const route = await this.routeRepo.findOne({ where: { id } });
        if (!route) throw new Error('Ruta no encontrada');
        return this.routeRepo.softRemove(route);
    }
}

