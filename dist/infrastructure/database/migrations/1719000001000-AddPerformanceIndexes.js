"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPerformanceIndexes1719000001000 = void 0;
const typeorm_1 = require("typeorm");
/**
 * Migración: Agregar índices de rendimiento en tablas críticas
 * Optimiza las consultas más frecuentes:
 * - Búsqueda de viajes por fecha y estado
 * - Listado de viajes por empresa
 * - Búsqueda de reservas por viaje
 * - Búsqueda de vehículos por empresa
 *
 * Ejecutar: npm run typeorm migration:run
 */
class AddPerformanceIndexes1719000001000 {
    constructor() {
        this.name = 'AddPerformanceIndexes1719000001000';
    }
    async up(queryRunner) {
        // ─── Tabla: trips ──────────────────────────────────────────────────────
        // Índice compuesto: búsqueda de viajes por estado + fecha (query más frecuente)
        // Usado en: SearchTripsService, TripManagementService.findByCompany
        await queryRunner.createIndex('trips', new typeorm_1.TableIndex({
            name: 'IDX_trips_status_departure_time',
            columnNames: ['status', 'departure_time'],
        }));
        // Índice en departure_time solo (para rangos de fecha)
        await queryRunner.createIndex('trips', new typeorm_1.TableIndex({
            name: 'IDX_trips_departure_time',
            columnNames: ['departure_time'],
        }));
        // Índice en vehicle_id (para verificar conflictos de vehículo)
        await queryRunner.createIndex('trips', new typeorm_1.TableIndex({
            name: 'IDX_trips_vehicle_id',
            columnNames: ['vehicle_id'],
        }));
        // Índice en route_id (para listar viajes de una ruta)
        await queryRunner.createIndex('trips', new typeorm_1.TableIndex({
            name: 'IDX_trips_route_id',
            columnNames: ['route_id'],
        }));
        // ─── Tabla: bookings ───────────────────────────────────────────────────
        // Índice compuesto: reservas por viaje + estado (manifiesto de pasajeros)
        // Usado en: TripManagementService.getPassengerManifest, TripController manifest
        await queryRunner.createIndex('bookings', new typeorm_1.TableIndex({
            name: 'IDX_bookings_trip_id_payment_status',
            columnNames: ['trip_id', 'payment_status'],
        }));
        // Índice en trip_id + seat_id (verificación de overbooking)
        await queryRunner.createIndex('bookings', new typeorm_1.TableIndex({
            name: 'IDX_bookings_trip_id_seat_id',
            columnNames: ['trip_id', 'seat_id'],
        }));
        // Índice en created_at (ordenamiento por fecha de creación)
        await queryRunner.createIndex('bookings', new typeorm_1.TableIndex({
            name: 'IDX_bookings_created_at',
            columnNames: ['created_at'],
        }));
        // ─── Tabla: routes ─────────────────────────────────────────────────────
        // Índice en company_id (listar rutas de una empresa)
        await queryRunner.createIndex('routes', new typeorm_1.TableIndex({
            name: 'IDX_routes_company_id',
            columnNames: ['company_id'],
        }));
        // ─── Tabla: vehicles ───────────────────────────────────────────────────
        // Índice en company_id (listar vehículos de una empresa)
        await queryRunner.createIndex('vehicles', new typeorm_1.TableIndex({
            name: 'IDX_vehicles_company_id',
            columnNames: ['company_id'],
        }));
        // Índice en plate_number (búsqueda por placa)
        await queryRunner.createIndex('vehicles', new typeorm_1.TableIndex({
            name: 'IDX_vehicles_plate_number',
            columnNames: ['plate_number'],
            isUnique: true,
        }));
        // ─── Tabla: route_waypoints ────────────────────────────────────────────
        // Índice compuesto: waypoints de una ruta ordenados (búsqueda de viajes)
        await queryRunner.createIndex('route_waypoints', new typeorm_1.TableIndex({
            name: 'IDX_route_waypoints_route_id_stop_order',
            columnNames: ['route_id', 'stop_order'],
        }));
        // ─── Tabla: stations ───────────────────────────────────────────────────
        // Índice en city (búsqueda de estaciones por ciudad)
        await queryRunner.createIndex('stations', new typeorm_1.TableIndex({
            name: 'IDX_stations_city',
            columnNames: ['city'],
        }));
        // ─── Estadísticas ──────────────────────────────────────────────────────
        // Actualizar estadísticas del planificador de consultas
        await queryRunner.query('ANALYZE trips, bookings, routes, vehicles, route_waypoints, stations');
    }
    async down(queryRunner) {
        // Eliminar índices en orden inverso
        await queryRunner.dropIndex('stations', 'IDX_stations_city');
        await queryRunner.dropIndex('route_waypoints', 'IDX_route_waypoints_route_id_stop_order');
        await queryRunner.dropIndex('vehicles', 'IDX_vehicles_plate_number');
        await queryRunner.dropIndex('vehicles', 'IDX_vehicles_company_id');
        await queryRunner.dropIndex('routes', 'IDX_routes_company_id');
        await queryRunner.dropIndex('bookings', 'IDX_bookings_created_at');
        await queryRunner.dropIndex('bookings', 'IDX_bookings_trip_id_seat_id');
        await queryRunner.dropIndex('bookings', 'IDX_bookings_trip_id_payment_status');
        await queryRunner.dropIndex('trips', 'IDX_trips_route_id');
        await queryRunner.dropIndex('trips', 'IDX_trips_vehicle_id');
        await queryRunner.dropIndex('trips', 'IDX_trips_departure_time');
        await queryRunner.dropIndex('trips', 'IDX_trips_status_departure_time');
    }
}
exports.AddPerformanceIndexes1719000001000 = AddPerformanceIndexes1719000001000;
//# sourceMappingURL=1719000001000-AddPerformanceIndexes.js.map