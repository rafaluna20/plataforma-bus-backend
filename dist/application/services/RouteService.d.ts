import { RouteEntity } from '../../infrastructure/database/entities/RouteEntity';
import { StationEntity } from '../../infrastructure/database/entities/StationEntity';
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
export declare class RouteService {
    private get routeRepo();
    private get waypointRepo();
    private get stationRepo();
    private get companyRepo();
    /** Crear un paradero o agencia con coordenadas geográficas */
    createStation(data: CreateStationDTO): Promise<StationEntity>;
    /** Listar paraderos por ciudad */
    findStationsByCity(city: string): Promise<StationEntity[]>;
    /** Crear una ruta completa con sus paradas intermedias (waypoints) */
    createRoute(data: CreateRouteDTO): Promise<RouteEntity>;
    /** Listar rutas de una empresa */
    findByCompany(companyId: string): Promise<RouteEntity[]>;
    /** Obtener una ruta por ID con todos sus waypoints */
    findById(id: string): Promise<RouteEntity>;
}
//# sourceMappingURL=RouteService.d.ts.map