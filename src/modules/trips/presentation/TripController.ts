import { Router, Request, Response, NextFunction } from 'express';
import { SearchTripsService, SearchTripsResult } from '../application/SearchTripsService';
import { AppDataSource } from '../../../infrastructure/database/data-source';
import { BookingEntity, PaymentStatus } from '../../bookings/domain/BookingEntity';

const router = Router();
const searchTripsService = new SearchTripsService();

/**
 * GET /api/v1/trips/search?origin=Lima&destination=Huancayo&date=2026-07-15&page=1&limit=15
 * Busca viajes disponibles por ciudad de origen, destino y fecha.
 * Endpoint público — no requiere autenticación.
 */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { origin, destination, date, page, limit, companyId, vehicleType } = req.query;

        let travelDate: Date | undefined;

        if (date) {
            let dateString = date as string;
            if (dateString.length === 10) {
                dateString += 'T00:00:00';
            }
            travelDate = new Date(dateString);
            if (isNaN(travelDate.getTime())) {
                return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' });
            }
        }

        const results = await searchTripsService.execute({
            originCity: origin as string,
            destinationCity: destination as string,
            travelDate,
            companyId: companyId as string | undefined,
            vehicleType: vehicleType as string | undefined,
            page: page ? parseInt(page as string) : 1,
            limit: limit ? parseInt(limit as string) : 15,
        }) as SearchTripsResult;

        return res.status(200).json({
            count: results.data.length,
            total: results.total,
            page: results.page,
            totalPages: results.totalPages,
            trips: results.data,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/trips/:tripId
 * Retorna el detalle completo de un viaje (ruta, vehículo, empresa, asientos ocupados).
 * Endpoint público — no requiere autenticación.
 */
router.get('/:tripId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.params as { tripId: string };
        const tripRepo = AppDataSource.getRepository(
            (await import('../domain/TripEntity')).TripEntity
        );
        const bookingRepo = AppDataSource.getRepository(BookingEntity);

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
            trip.route.waypoints.sort((a: any, b: any) => a.stopOrder - b.stopOrder);
        }

        // Obtener asientos ocupados (activos)
        const activeStatuses = [
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];
        const bookings = await bookingRepo
            .createQueryBuilder('b')
            .select(['b.seat_id', 'b.payment_status'])
            .where('b.trip_id = :tripId', { tripId })
            .andWhere('b.payment_status IN (:...activeStatuses)', { activeStatuses })
            .getMany();

        const occupiedSeats = bookings.map((b: any) => b.seatId);

        return res.status(200).json({ trip, occupiedSeats });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/trips/:tripId/manifest
 * Retorna la lista de pasajeros (manifiesto) para el chofer.
 * Endpoint público para el MVP — en producción proteger con authenticate + authorize(DRIVER, ADMIN)
 */
router.get('/:tripId/manifest', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.params as { tripId: string };
        const bookingRepo = AppDataSource.getRepository(BookingEntity);

        // Incluir todos los estados activos (CORRECCIÓN del bug original)
        const activeStatuses = [
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];

        const allBookings = await bookingRepo
            .createQueryBuilder('b')
            .leftJoinAndSelect('b.startWaypoint', 'sw')
            .leftJoinAndSelect('sw.station', 'ss')
            .leftJoinAndSelect('b.endWaypoint', 'ew')
            .leftJoinAndSelect('ew.station', 'es')
            .leftJoinAndSelect('b.user', 'u')
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
                origin: (b.startWaypoint as any)?.station?.name || 'Origen',
                destination: (b.endWaypoint as any)?.station?.name || 'Destino',
                paymentStatus: b.paymentStatus,
                paymentMethod: b.paymentMethod || 'CASH',
                price: Number(b.totalPrice),
                createdAt: b.createdAt,
                seller: b.user ? {
                    id:    b.user.id,
                    name:  b.user.name,
                    email: b.user.email,
                    role:  b.user.role,
                } : null,
            })),
        });
    } catch (error) {
        next(error);
    }
});

export default router;
