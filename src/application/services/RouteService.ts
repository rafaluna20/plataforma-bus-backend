import { AppDataSource } from '../../infrastructure/database/data-source';
import { RouteEntity } from '../../infrastructure/database/entities/RouteEntity';
import { RouteWaypointEntity } from '../../infrastructure/database/entities/RouteWaypointEntity';
import { StationEntity } from '../../infrastructure/database/entities/StationEntity';
import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
import { ServiceMode } from '../../infrastructure/database/entities/VehicleEntity';

export interface CreateStationDTO {
    companyId?: string;
    name: string;
    address?: string;
    city: string;
    latitude: number;
    longitude: number;
}

export interface WaypointInput {
    stationId: string;
    stopOrder: number;
    estimatedDurationMins: number;
    basePrice: number;
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
        route.waypoints = route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
        return route;
    }
}
