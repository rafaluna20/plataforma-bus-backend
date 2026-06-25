"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SearchTripsService_1 = require("../../application/services/SearchTripsService");
const data_source_1 = require("../../infrastructure/database/data-source");
const BookingEntity_1 = require("../../infrastructure/database/entities/BookingEntity");
const router = (0, express_1.Router)();
const searchTripsService = new SearchTripsService_1.SearchTripsService();
/**
 * GET /api/v1/trips/search?origin=Lima&destination=Huancayo&date=2026-07-15&page=1&limit=15
 * Busca viajes disponibles por ciudad de origen, destino y fecha.
 * Endpoint público — no requiere autenticación.
 */
router.get('/search', async (req, res, next) => {
    try {
        const { origin, destination, date, page, limit, companyId, vehicleType } = req.query;
        let travelDate;
        if (date) {
            let dateString = date;
            if (dateString.length === 10) {
                dateString += 'T00:00:00';
            }
            travelDate = new Date(dateString);
            if (isNaN(travelDate.getTime())) {
                return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' });
            }
        }
        const results = await searchTripsService.execute({
            originCity: origin,
            destinationCity: destination,
            travelDate,
            companyId: companyId,
            vehicleType: vehicleType,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 15,
        });
        return res.status(200).json({
            count: results.data.length,
            total: results.total,
            page: results.page,
            totalPages: results.totalPages,
            trips: results.data,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/trips/:tripId
 * Retorna el detalle completo de un viaje (ruta, vehículo, empresa, asientos ocupados).
 * Endpoint público — no requiere autenticación.
 */
router.get('/:tripId', async (req, res, next) => {
    try {
        const { tripId } = req.params;
        const tripRepo = data_source_1.AppDataSource.getRepository((await Promise.resolve().then(() => __importStar(require('../../infrastructure/database/entities/TripEntity')))).TripEntity);
        const bookingRepo = data_source_1.AppDataSource.getRepository(BookingEntity_1.BookingEntity);
        const trip = await tripRepo
            .createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('route.company', 'company')
            .innerJoinAndSelect('route.waypoints', 'waypoints')
            .innerJoinAndSelect('waypoints.station', 'station')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            .where('trip.id = :tripId', { tripId })
            .getOne();
        if (!trip) {
            return res.status(404).json({ error: 'Viaje no encontrado' });
        }
        // Ordenar waypoints
        if (trip.route?.waypoints) {
            trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
        }
        // Obtener asientos ocupados (activos)
        const activeStatuses = [
            BookingEntity_1.PaymentStatus.PENDING_CASH,
            BookingEntity_1.PaymentStatus.PAID_DIGITAL,
            BookingEntity_1.PaymentStatus.PAID,
        ];
        const bookings = await bookingRepo
            .createQueryBuilder('b')
            .select(['b.seat_id', 'b.payment_status'])
            .where('b.trip_id = :tripId', { tripId })
            .andWhere('b.payment_status IN (:...activeStatuses)', { activeStatuses })
            .getMany();
        const occupiedSeats = bookings.map((b) => b.seatId);
        return res.status(200).json({ trip, occupiedSeats });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/trips/:tripId/manifest
 * Retorna la lista de pasajeros (manifiesto) para el chofer.
 * Endpoint público para el MVP — en producción proteger con authenticate + authorize(DRIVER, ADMIN)
 */
router.get('/:tripId/manifest', async (req, res, next) => {
    try {
        const { tripId } = req.params;
        const bookingRepo = data_source_1.AppDataSource.getRepository(BookingEntity_1.BookingEntity);
        // Incluir todos los estados activos (CORRECCIÓN del bug original)
        const activeStatuses = [
            BookingEntity_1.PaymentStatus.PENDING_CASH,
            BookingEntity_1.PaymentStatus.PAID_DIGITAL,
            BookingEntity_1.PaymentStatus.PAID,
        ];
        const allBookings = await bookingRepo
            .createQueryBuilder('b')
            .leftJoinAndSelect('b.startWaypoint', 'sw')
            .leftJoinAndSelect('sw.station', 'ss')
            .leftJoinAndSelect('b.endWaypoint', 'ew')
            .leftJoinAndSelect('ew.station', 'es')
            .where('b.trip_id = :tripId', { tripId })
            .andWhere('b.payment_status IN (:...activeStatuses)', { activeStatuses })
            .orderBy('b.seatId', 'ASC')
            .getMany();
        return res.status(200).json({
            tripId,
            totalPassengers: allBookings.length,
            passengers: allBookings.map(b => ({
                id: b.id,
                seatId: b.seatId,
                name: b.passengerName,
                document: `${b.passengerDocType} ${b.passengerDocNum}`,
                origin: b.startWaypoint?.station?.name || 'Origen',
                destination: b.endWaypoint?.station?.name || 'Destino',
                paymentStatus: b.paymentStatus,
                paymentMethod: b.paymentMethod || 'CASH',
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=TripController.js.map