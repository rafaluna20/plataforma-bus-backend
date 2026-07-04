import { AppDataSource } from '../../../infrastructure/database/data-source';
import { BookingEntity, PaymentStatus } from '../domain/BookingEntity';
// Import directo al domain (no al barrel del módulo) para evitar cargar
// TripManagementController/TripManagementService solo por la entidad.
import { TripEntity } from '../../trips/domain/TripEntity';
import { RouteWaypointEntity } from '../../../infrastructure/database/entities/RouteWaypointEntity';
import { PaymentGateway, PaymentDetails } from '../../payments/application/ports/PaymentGateway';
import { logger } from '../../../infrastructure/logger';

export interface CreateBookingDTO {
    tripId: string;
    passengerName: string;
    passengerDocType: string;
    passengerDocNum: string;
    startWaypointId: string;
    endWaypointId: string;
    seatId: string;
    userId?: string; // ID del usuario autenticado (opcional para reservas en mostrador)
}

export class BookingService {

    /**
     * Determina el piso (1 = VIP/abajo, 2 = estándar) de un asiento a partir del
     * seatTemplate del vehículo. Replica la misma lógica que ya usa el frontend
     * (SeatMapModal) para que el precio mostrado en la venta coincida con el cobrado.
     */
    private getSeatFloor(vehicle: { seatTemplate: any } | null | undefined, seatId: string): 1 | 2 {
        const template = vehicle?.seatTemplate;
        if (!template) return 2;
        const raw = Array.isArray(template) ? template : (template.seats ?? []);
        const seat = raw.find((s: any) => s.id === seatId);
        return seat?.floor === 1 ? 1 : 2;
    }

    // ─── Método privado compartido: validar y calcular precio ─────────────────
    private async validateAndCalculate(
        data: CreateBookingDTO,
        bookingRepo: ReturnType<typeof AppDataSource.getRepository<BookingEntity>>,
        tripRepo: ReturnType<typeof AppDataSource.getRepository<TripEntity>>,
        waypointRepo: ReturnType<typeof AppDataSource.getRepository<RouteWaypointEntity>>,
        excludeStatuses: PaymentStatus[]
    ) {
        // 1. Obtener Viaje y Tramos Solicitados
        const trip = await tripRepo.findOne({
            where: { id: data.tripId },
            relations: { route: true, vehicle: true },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        const startWaypoint = await waypointRepo.findOne({ where: { id: data.startWaypointId } });
        const endWaypoint = await waypointRepo.findOne({ where: { id: data.endWaypointId } });

        if (!startWaypoint || !endWaypoint) throw new Error('Puntos de ruta inválidos');
        if (startWaypoint.stopOrder >= endWaypoint.stopOrder) {
            throw new Error('Orden de ruta ilógico (Origen debe ser antes del Destino)');
        }

        // 2. Prevención de Overbooking Tramificado
        // Algoritmo de solapamiento de intervalos: (A.start < B.end) AND (A.end > B.start)
        const qb = bookingRepo.createQueryBuilder('booking')
            .innerJoin('booking.startWaypoint', 'sw')
            .innerJoin('booking.endWaypoint', 'ew')
            .where('booking.trip_id = :tripId', { tripId: data.tripId })
            .andWhere('booking.seat_id = :seatId', { seatId: data.seatId })
            .andWhere('sw.stop_order < :requestedEndOrder', { requestedEndOrder: endWaypoint.stopOrder })
            .andWhere('ew.stop_order > :requestedStartOrder', { requestedStartOrder: startWaypoint.stopOrder });

        // Excluir los estados que no bloquean el asiento (CANCELLED, FAILED, etc.)
        if (excludeStatuses.length > 0) {
            qb.andWhere('booking.payment_status NOT IN (:...excludeStatuses)', { excludeStatuses });
        }

        const conflictingBookings = await qb.getMany();

        if (conflictingBookings.length > 0) {
            throw new Error(`El asiento ${data.seatId} ya se encuentra ocupado en este tramo o en parte de él.`);
        }

        // 3. Calcular Precio Final sumando los tramos intermedios
        // Bus de dos pisos: el piso 1 (VIP) usa basePriceFloor1 si está definido;
        // cualquier otro caso usa basePrice (piso 2 / vehículo de un piso).
        const allRouteWaypoints = await waypointRepo.find({
            where: { route: { id: trip.route.id } },
            order: { stopOrder: 'ASC' },
        });

        const seatFloor = this.getSeatFloor(trip.vehicle, data.seatId);

        let calculatedPrice = 0;
        for (const wp of allRouteWaypoints) {
            if (wp.stopOrder > startWaypoint.stopOrder && wp.stopOrder <= endWaypoint.stopOrder) {
                calculatedPrice += seatFloor === 1 && wp.basePriceFloor1 != null
                    ? Number(wp.basePriceFloor1)
                    : Number(wp.basePrice);
            }
        }

        if (calculatedPrice <= 0) {
            throw new Error('No se pudo calcular el precio para este tramo. Verifica los waypoints.');
        }

        return { trip, startWaypoint, endWaypoint, calculatedPrice };
    }

    /**
     * Crea una reserva al contado validando estrictamente el overbooking por tramos.
     * Nivel de aislamiento SERIALIZABLE para prevenir condiciones de carrera.
     */
    public async createCashBooking(data: CreateBookingDTO): Promise<BookingEntity> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('SERIALIZABLE');

        try {
            const tripRepo = queryRunner.manager.getRepository(TripEntity);
            const waypointRepo = queryRunner.manager.getRepository(RouteWaypointEntity);
            const bookingRepo = queryRunner.manager.getRepository(BookingEntity);

            const { trip, startWaypoint, endWaypoint, calculatedPrice } = await this.validateAndCalculate(
                data,
                bookingRepo,
                tripRepo,
                waypointRepo,
                [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]
            );

            const newBooking = bookingRepo.create({
                trip,
                passengerName: data.passengerName,
                passengerDocType: data.passengerDocType,
                passengerDocNum: data.passengerDocNum,
                startWaypoint,
                endWaypoint,
                seatId: data.seatId,
                totalPrice: calculatedPrice,
                paymentStatus: PaymentStatus.PENDING_CASH,
                user: data.userId ? ({ id: data.userId } as any) : null,
            });

            await bookingRepo.save(newBooking);
            await queryRunner.commitTransaction();

            logger.info(`Reserva al contado creada: ${newBooking.id} | Asiento: ${data.seatId} | Precio: S/${calculatedPrice}`);
            return newBooking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Crea una reserva digital. Ejecuta el cobro de forma síncrona.
     * Si el pago falla, aborta la transacción y libera el asiento.
     */
    public async createDigitalBooking(
        data: CreateBookingDTO,
        paymentGateway: PaymentGateway,
        paymentDetails: PaymentDetails
    ): Promise<BookingEntity> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('SERIALIZABLE');

        try {
            const tripRepo = queryRunner.manager.getRepository(TripEntity);
            const waypointRepo = queryRunner.manager.getRepository(RouteWaypointEntity);
            const bookingRepo = queryRunner.manager.getRepository(BookingEntity);

            const { trip, startWaypoint, endWaypoint, calculatedPrice } = await this.validateAndCalculate(
                data,
                bookingRepo,
                tripRepo,
                waypointRepo,
                [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]
            );

            // 1. Guardar la reserva como PENDING_DIGITAL (bloquea el asiento en la BD)
            const newBooking = bookingRepo.create({
                trip,
                passengerName: data.passengerName,
                passengerDocType: data.passengerDocType,
                passengerDocNum: data.passengerDocNum,
                startWaypoint,
                endWaypoint,
                seatId: data.seatId,
                totalPrice: calculatedPrice,
                paymentStatus: PaymentStatus.PENDING_DIGITAL,
                paymentMethod: paymentDetails.method as string,
                user: data.userId ? ({ id: data.userId } as any) : null,
            });
            await bookingRepo.save(newBooking);

            // 2. Procesar el pago con la pasarela (Gateway)
            paymentDetails.amount = calculatedPrice;
            const paymentResult = await paymentGateway.processPayment(paymentDetails);

            if (!paymentResult.success) {
                // Si falla, lanzar error → rollback → asiento liberado
                throw new Error(`Pago rechazado: ${paymentResult.errorMessage}`);
            }

            // 3. Pago Exitoso → actualizar estado
            newBooking.paymentStatus = PaymentStatus.PAID_DIGITAL;
            newBooking.paymentGatewayRef = paymentResult.transactionId ?? '';
            await bookingRepo.save(newBooking);

            await queryRunner.commitTransaction();

            logger.info(`Reserva digital creada: ${newBooking.id} | Asiento: ${data.seatId} | Precio: S/${calculatedPrice} | Ref: ${newBooking.paymentGatewayRef}`);
            return newBooking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Obtener reservas de un usuario autenticado
     */
    public async getMyBookings(userId: string, page = 1, limit = 10) {
        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const skip = (page - 1) * limit;

        const [bookings, total] = await bookingRepo.findAndCount({
            where: { user: { id: userId } },
            relations: {
                trip: { route: { company: true }, vehicle: true },
                startWaypoint: { station: true },
                endWaypoint: { station: true },
            },
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });

        return {
            data: bookings,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Cancelar una reserva (solo si está PENDING_CASH o PENDING_DIGITAL)
     */
    public async cancelBooking(bookingId: string, userId?: string): Promise<BookingEntity> {
        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const booking = await bookingRepo.findOne({
            where: { id: bookingId },
        });

        if (!booking) throw new Error('Reserva no encontrada');

        const cancellableStatuses = [PaymentStatus.PENDING_CASH, PaymentStatus.PENDING_DIGITAL];
        if (!cancellableStatuses.includes(booking.paymentStatus)) {
            throw new Error(`No se puede cancelar una reserva con estado: ${booking.paymentStatus}`);
        }

        booking.paymentStatus = PaymentStatus.CANCELLED;
        await bookingRepo.save(booking);

        logger.info(`Reserva cancelada: ${bookingId}`);
        return booking;
    }
}
