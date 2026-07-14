import { Router, Request, Response, NextFunction } from 'express';
import { SearchTripsService, SearchTripsResult } from '../application/SearchTripsService';
import { AppDataSource } from '../../../infrastructure/database/data-source';
import { BookingEntity, PaymentStatus } from '../../bookings/domain/BookingEntity';
import { TripEntity } from '../domain/TripEntity';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';
import { authenticate, authorize } from '../../../presentation/middlewares/auth.middleware';

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

        // Obtener asientos ocupados (venta real, cualquier estado de pago activo)
        // y apartados (RESERVED: pasajero identificado, sin cobrar todavía) por
        // separado, para que el mapa de asientos pueda pintarlos distinto.
        const activeStatuses = [
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];
        // OJO: .select() de TypeORM necesita los nombres de PROPIEDAD de la
        // entidad (camelCase: 'b.seatId'), no el nombre de columna de la BD
        // ('b.seat_id') -- y SIEMPRE debe incluir la clave primaria ('b.id'),
        // o getMany() no puede hidratar las entidades y devuelve [] en
        // silencio (sin lanzar error), aunque la fila exista en la BD. Este
        // bug hacía que occupiedSeats devolviera siempre vacío sin importar
        // cuántos asientos estuvieran realmente vendidos.
        const bookings = await bookingRepo
            .createQueryBuilder('b')
            .select(['b.id', 'b.seatId'])
            .where('b.trip_id = :tripId', { tripId })
            .andWhere('b.payment_status IN (:...activeStatuses)', { activeStatuses })
            .getMany();

        const reservedBookings = await bookingRepo
            .createQueryBuilder('b')
            .select(['b.id', 'b.seatId'])
            .where('b.trip_id = :tripId', { tripId })
            .andWhere('b.payment_status = :reserved', { reserved: PaymentStatus.RESERVED })
            .getMany();

        const occupiedSeats = bookings.map((b) => b.seatId);
        const reservedSeats = reservedBookings.map((b) => b.seatId);

        return res.status(200).json({ trip, occupiedSeats, reservedSeats });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/trips/:tripId/manifest
 * Retorna la lista de pasajeros (manifiesto) para el chofer.
 * Contiene PII (DNI/pasaporte) — restringido a DRIVER/AGENCY_SELLER/ADMIN de la
 * empresa dueña del viaje, o SUPER_ADMIN.
 */
router.get(
    '/:tripId/manifest',
    authenticate,
    authorize(UserRole.DRIVER, UserRole.AGENCY_SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.params as { tripId: string };

        if (req.user!.role !== UserRole.SUPER_ADMIN) {
            const tripRepo = AppDataSource.getRepository(TripEntity);
            const trip = await tripRepo.findOne({
                where: { id: tripId },
                relations: { route: { company: true } },
            });
            if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });

            if (trip.route?.company?.id !== req.user!.companyId) {
                return res.status(403).json({ error: 'No tienes permisos para ver el manifiesto de este viaje.' });
            }
        }

        const bookingRepo = AppDataSource.getRepository(BookingEntity);

        // Incluir todos los estados activos (CORRECCIÓN del bug original) --
        // RESERVED también aparece aquí (con su propio paymentStatus) para que
        // el staff vea quién apartó cada asiento, no solo quién ya pagó.
        const activeStatuses = [
            PaymentStatus.RESERVED,
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
                age: b.passengerAge,
                phone: b.passengerPhone,
                ticketNumber: b.ticketNumber,
                observations: b.observations,
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

/**
 * GET /api/v1/trips/:tripId/manifest-print
 * Datos completos para imprimir el Manifiesto de Pasajeros en el formato
 * exigido por SUNAT/MTC: empresa (sedes, RUC, autorización de impresión),
 * vehículo (marca, TUC, póliza), conductor/copiloto/auxiliar, y la lista de
 * pasajeros con edad/celular/N° de boleto/observaciones.
 *
 * Asigna el N° de manifiesto del viaje la PRIMERA vez que se llama a este
 * endpoint (queda congelado para reimpresiones futuras).
 *
 * Restringido a DRIVER/AGENCY_SELLER/ADMIN de la empresa dueña del viaje, o SUPER_ADMIN.
 */
router.get(
    '/:tripId/manifest-print',
    authenticate,
    authorize(UserRole.DRIVER, UserRole.AGENCY_SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.params as { tripId: string };

        const tripRepo = AppDataSource.getRepository(TripEntity);
        const trip = await tripRepo
            .createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('route.company', 'company')
            .innerJoinAndSelect('route.waypoints', 'waypoints')
            .innerJoinAndSelect('waypoints.station', 'station')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            .leftJoinAndSelect('trip.driver', 'driver')
            .where('trip.id = :tripId', { tripId })
            .getOne();

        if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });

        if (req.user!.role !== UserRole.SUPER_ADMIN && trip.route.company.id !== req.user!.companyId) {
            return res.status(403).json({ error: 'No tienes permisos para ver el manifiesto de este viaje.' });
        }

        // Asignar el N° de manifiesto la primera vez (queda congelado en reimpresiones).
        // El WHERE manifest_number IS NULL evita pisar un número ya asignado si
        // dos impresiones llegan casi al mismo tiempo.
        if (!trip.manifestNumber) {
            const result = await AppDataSource.query(
                `UPDATE companies SET manifest_next_number = manifest_next_number + 1 WHERE id = $1 RETURNING manifest_next_number, manifest_series`,
                [trip.route.company.id]
            );
            const series = result[0]?.manifest_series || '001';
            const next = result[0]?.manifest_next_number || 1;
            const manifestNumber = `${series}-${String(next).padStart(6, '0')}`;
            await AppDataSource.query(
                `UPDATE trips SET manifest_number = $1 WHERE id = $2 AND manifest_number IS NULL`,
                [manifestNumber, tripId]
            );
            trip.manifestNumber = manifestNumber;
        }

        trip.route.waypoints.sort((a: any, b: any) => a.stopOrder - b.stopOrder);

        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const activeStatuses = [
            PaymentStatus.RESERVED,
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];
        const bookings = await bookingRepo
            .createQueryBuilder('b')
            .leftJoinAndSelect('b.startWaypoint', 'sw')
            .leftJoinAndSelect('sw.station', 'ss')
            .leftJoinAndSelect('b.endWaypoint', 'ew')
            .leftJoinAndSelect('ew.station', 'es')
            .where('b.trip_id = :tripId', { tripId })
            .andWhere('b.payment_status IN (:...activeStatuses)', { activeStatuses })
            .orderBy('b.seatId', 'ASC')
            .getMany();

        const company = trip.route.company;
        const waypoints = trip.route.waypoints;

        return res.status(200).json({
            company: {
                ruc: company.ruc,
                tradeName: company.tradeName,
                legalName: company.legalName,
                logoUrl: company.logoUrl,
                phone: company.phone,
                fiscalAddress: company.fiscalAddress,
                officeBranches: company.officeBranches || [],
                contactEmail: company.contactEmail,
                sunatPrintAuthorization: company.sunatPrintAuthorization,
            },
            vehicle: {
                plateNumber: trip.vehicle.plateNumber,
                brand: trip.vehicle.brand,
                vehicleType: trip.vehicle.vehicleType,
                circulationCard: trip.vehicle.circulationCard,
                insurancePolicy: trip.vehicle.insurancePolicy,
                capacity: trip.vehicle.capacity,
            },
            trip: {
                id: trip.id,
                departureTime: trip.departureTime,
                manifestNumber: trip.manifestNumber,
                origin: waypoints[0]?.station?.name || '',
                destination: waypoints[waypoints.length - 1]?.station?.name || '',
                driver: trip.driver ? { name: trip.driver.name, licenseNumber: trip.driver.licenseNumber } : null,
                copilotName: trip.copilotName,
                copilotLicense: trip.copilotLicense,
                auxiliarName: trip.auxiliarName,
            },
            passengers: bookings.map(b => ({
                id: b.id,
                seatId: b.seatId,
                name: b.passengerName,
                document: `${b.passengerDocType} ${b.passengerDocNum}`,
                age: b.passengerAge,
                phone: b.passengerPhone,
                ticketNumber: b.ticketNumber,
                observations: b.observations,
                destination: (b.endWaypoint as any)?.station?.name || 'Destino',
                price: Number(b.totalPrice),
                paymentStatus: b.paymentStatus,
            })),
        });
    } catch (error) {
        next(error);
    }
});

export default router;
