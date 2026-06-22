"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteService = void 0;
const data_source_1 = require("../../infrastructure/database/data-source");
const RouteEntity_1 = require("../../infrastructure/database/entities/RouteEntity");
const RouteWaypointEntity_1 = require("../../infrastructure/database/entities/RouteWaypointEntity");
const StationEntity_1 = require("../../infrastructure/database/entities/StationEntity");
const CompanyEntity_1 = require("../../infrastructure/database/entities/CompanyEntity");
class RouteService {
    get routeRepo() {
        return data_source_1.AppDataSource.getRepository(RouteEntity_1.RouteEntity);
    }
    get waypointRepo() {
        return data_source_1.AppDataSource.getRepository(RouteWaypointEntity_1.RouteWaypointEntity);
    }
    get stationRepo() {
        return data_source_1.AppDataSource.getRepository(StationEntity_1.StationEntity);
    }
    get companyRepo() {
        return data_source_1.AppDataSource.getRepository(CompanyEntity_1.CompanyEntity);
    }
    // ==================== ESTACIONES / PARADEROS ====================
    /** Crear un paradero o agencia con coordenadas geográficas */
    async createStation(data) {
        let company = null;
        if (data.companyId) {
            company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company)
                throw new Error('Empresa no encontrada');
        }
        const station = this.stationRepo.create({
            company,
            name: data.name,
            address: data.address,
            city: data.city,
            // PostGIS: Crear punto geográfico con ST_SetSRID(ST_MakePoint(lng, lat), 4326)
            location: () => `ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)`,
        });
        return this.stationRepo.save(station);
    }
    /** Listar paraderos por ciudad */
    async findStationsByCity(city) {
        return this.stationRepo.find({
            where: { city, isActive: true },
            order: { name: 'ASC' },
        });
    }
    // ==================== RUTAS Y WAYPOINTS ====================
    /** Crear una ruta completa con sus paradas intermedias (waypoints) */
    async createRoute(data) {
        const queryRunner = data_source_1.AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company)
                throw new Error('Empresa no encontrada');
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
            const route = queryRunner.manager.create(RouteEntity_1.RouteEntity, {
                company,
                name: data.name,
                serviceMode: data.serviceMode,
                polyline: data.polyline || null,
            });
            const savedRoute = await queryRunner.manager.save(route);
            // Crear cada waypoint asociado a la ruta
            for (const wp of sortedWaypoints) {
                const station = await this.stationRepo.findOne({ where: { id: wp.stationId } });
                if (!station)
                    throw new Error(`Estación con ID ${wp.stationId} no encontrada`);
                const waypoint = queryRunner.manager.create(RouteWaypointEntity_1.RouteWaypointEntity, {
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
            });
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    /** Listar rutas de una empresa */
    async findByCompany(companyId) {
        return this.routeRepo.find({
            where: { company: { id: companyId } },
            relations: { waypoints: { station: true } },
            order: { name: 'ASC' },
        });
    }
    /** Obtener una ruta por ID con todos sus waypoints */
    async findById(id) {
        const route = await this.routeRepo.findOne({
            where: { id },
            relations: { waypoints: { station: true }, company: true },
        });
        if (!route)
            throw new Error('Ruta no encontrada');
        // Ordenar waypoints por stop_order
        route.waypoints = route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
        return route;
    }
}
exports.RouteService = RouteService;
//# sourceMappingURL=RouteService.js.map