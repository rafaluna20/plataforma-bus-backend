"use strict";
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
        const { origin, destination, date, page, limit } = req.query;
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