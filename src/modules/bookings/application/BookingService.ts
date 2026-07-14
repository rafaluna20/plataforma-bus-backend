import { AppDataSource } from '../../../infrastructure/database/data-source';
import { BookingEntity, PaymentStatus } from '../domain/BookingEntity';
// Import directo al domain (no al barrel del módulo) para evitar cargar
// TripManagementController/TripManagementService solo por la entidad.
import { TripEntity, TripStatus } from '../../trips/domain/TripEntity';
import { RouteWaypointEntity } from '../../../infrastructure/database/entities/RouteWaypointEntity';
import { PaymentGateway, PaymentDetails } from '../../payments/application/ports/PaymentGateway';
import { logger } from '../../../infrastructure/logger';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';
import { assertSameCompany } from '../../../infrastructure/auth/companyScope';
import { FareRuleService } from '../../../application/services/FareRuleService';

export interface CreateBookingDTO {
    tripId: string;
    passengerName: string;
    passengerDocType: string;
    passengerDocNum: string;
    startWaypointId: string;
    endWaypointId: string;
    seatId: string;
    userId?: string; // ID del usuario autenticado (opcional para reservas en mostrador)
    actorRole?: UserRole; // Rol de quien crea la reserva (staff queda confinado a su empresa; PASSENGER no)
    actorCompanyId?: string;
    // ─── Opcionales, solo para el Manifiesto de Pasajeros (SUNAT/MTC) ─────────
    passengerAge?: number;
    passengerPhone?: string;
    observations?: string;
    // ─── Ajuste manual de precio -- solo ADMIN/SUPER_ADMIN, y solo con motivo.
    // Queda registrado en auditoría (ver BookingController) comparando contra
    // systemPrice, el precio que el sistema hubiese cobrado sin el ajuste.
    priceOverride?: number;
    overrideReason?: string;
}

export class BookingService {
    private readonly fareRuleService = new FareRuleService();

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
            relations: { route: { company: true }, vehicle: true },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        // No se puede vender/reservar en un viaje que ya terminó o fue
        // cancelado. SCHEDULED/BOARDING/IN_TRANSIT sí permiten venta:
        // IN_TRANSIT cubre el caso real de vender un tramo intermedio
        // (ej. el bus salió de Huancayo y un pasajero sube en Jauja).
        if (trip.status === TripStatus.CANCELLED || trip.status === TripStatus.COMPLETED) {
            throw new Error(`No se puede vender pasajes en un viaje ${trip.status === TripStatus.CANCELLED ? 'cancelado' : 'ya completado'}`);
        }

        // Staff (ADMIN/AGENCY_SELLER/DRIVER) solo vende pasajes de SU empresa;
        // un PASSENGER autocomprando puede elegir cualquier empresa del marketplace.
        assertSameCompany(data.actorRole, data.actorCompanyId, trip.route.company.id);

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

        let basePrice = 0;
        for (const wp of allRouteWaypoints) {
            if (wp.stopOrder > startWaypoint.stopOrder && wp.stopOrder <= endWaypoint.stopOrder) {
                basePrice += seatFloor === 1 && wp.basePriceFloor1 != null
                    ? Number(wp.basePriceFloor1)
                    : Number(wp.basePrice);
            }
        }

        if (basePrice <= 0) {
            throw new Error('No se pudo calcular el precio para este tramo. Verifica los waypoints.');
        }

        // 4. Tarifa dinámica: aplicar el multiplicador de la regla vigente
        // (franja horaria / fecha especial) para la hora de salida del viaje.
        const multiplier = await this.fareRuleService.getMultiplier(trip.route.id, trip.departureTime);
        const systemPrice = Math.round(basePrice * multiplier * 100) / 100;

        // 5. Ajuste manual de precio (solo ADMIN/SUPER_ADMIN, con motivo
        // obligatorio) -- válvula de excepción puntual, auditada por el
        // controller comparando calculatedPrice (lo cobrado) vs systemPrice.
        let calculatedPrice = systemPrice;
        if (data.priceOverride && data.priceOverride > 0) {
            const isAdmin = data.actorRole === UserRole.ADMIN || data.actorRole === UserRole.SUPER_ADMIN;
            if (!isAdmin) {
                throw new Error('Solo un ADMIN puede ajustar manualmente el precio de un pasaje');
            }
            calculatedPrice = data.priceOverride;
        }

        return { trip, startWaypoint, endWaypoint, calculatedPrice, systemPrice };
    }

    /**
     * Asigna el próximo N° de boleto correlativo de la empresa (ej. "T-000123")
     * de forma atómica -- un solo UPDATE...RETURNING dentro de la misma
     * transacción de la reserva, para que dos ventas concurrentes nunca
     * obtengan el mismo número (el UPDATE toma el lock de fila de Postgres).
     */
    private async assignTicketNumber(
        companyId: string,
        manager: typeof AppDataSource.manager,
    ): Promise<string> {
        const result = await manager.query(
            `UPDATE companies SET ticket_next_number = ticket_next_number + 1 WHERE id = $1 RETURNING ticket_next_number`,
            [companyId]
        );
        const next = result[0]?.ticket_next_number ?? 1;
        return `T-${String(next).padStart(6, '0')}`;
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

            const { trip, startWaypoint, endWaypoint, calculatedPrice, systemPrice } = await this.validateAndCalculate(
                data,
                bookingRepo,
                tripRepo,
                waypointRepo,
                [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]
            );

            const ticketNumber = await this.assignTicketNumber(trip.route.company.id, queryRunner.manager);

            const newBooking = bookingRepo.create({
                trip,
                passengerName: data.passengerName,
                passengerDocType: data.passengerDocType,
                passengerDocNum: data.passengerDocNum,
                passengerAge: data.passengerAge,
                passengerPhone: data.passengerPhone,
                observations: data.observations,
                ticketNumber,
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
            // Precio "de sistema" (sin el ajuste manual, si lo hubo) — no se
            // persiste, solo viaja en la respuesta para que el controller
            // pueda auditar la diferencia si actorRole ajustó el precio.
            (newBooking as any).systemPrice = systemPrice;
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

            const { trip, startWaypoint, endWaypoint, calculatedPrice, systemPrice } = await this.validateAndCalculate(
                data,
                bookingRepo,
                tripRepo,
                waypointRepo,
                [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]
            );

            const ticketNumber = await this.assignTicketNumber(trip.route.company.id, queryRunner.manager);

            // 1. Guardar la reserva como PENDING_DIGITAL (bloquea el asiento en la BD)
            const newBooking = bookingRepo.create({
                trip,
                passengerName: data.passengerName,
                passengerDocType: data.passengerDocType,
                passengerDocNum: data.passengerDocNum,
                passengerAge: data.passengerAge,
                passengerPhone: data.passengerPhone,
                observations: data.observations,
                ticketNumber,
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
            // Precio "de sistema" (sin el ajuste manual, si lo hubo) — no se
            // persiste, solo viaja en la respuesta para que el controller
            // pueda auditar la diferencia si actorRole ajustó el precio.
            (newBooking as any).systemPrice = systemPrice;
            return newBooking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Aparta un asiento (RESERVED) con los datos del pasajero, sin cobrar
     * todavía. Bloquea el asiento igual que una venta (misma validación de
     * overbooking por tramos) -- se confirma después con confirmReservation()
     * hacia una venta real, o se cancela con cancelBooking() si nadie la usa.
     * Solo staff de la empresa (no PASSENGER) puede apartar asientos así, para
     * evitar que alguien reserve indefinidamente sin pagar ni comprometerse.
     */
    public async reserveSeat(data: CreateBookingDTO): Promise<BookingEntity> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('SERIALIZABLE');

        try {
            const tripRepo = queryRunner.manager.getRepository(TripEntity);
            const waypointRepo = queryRunner.manager.getRepository(RouteWaypointEntity);
            const bookingRepo = queryRunner.manager.getRepository(BookingEntity);

            const { trip, startWaypoint, endWaypoint, calculatedPrice, systemPrice } = await this.validateAndCalculate(
                data,
                bookingRepo,
                tripRepo,
                waypointRepo,
                [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]
            );

            const ticketNumber = await this.assignTicketNumber(trip.route.company.id, queryRunner.manager);

            const newBooking = bookingRepo.create({
                trip,
                passengerName: data.passengerName,
                passengerDocType: data.passengerDocType,
                passengerDocNum: data.passengerDocNum,
                passengerAge: data.passengerAge,
                passengerPhone: data.passengerPhone,
                observations: data.observations,
                ticketNumber,
                startWaypoint,
                endWaypoint,
                seatId: data.seatId,
                totalPrice: calculatedPrice,
                paymentStatus: PaymentStatus.RESERVED,
                user: data.userId ? ({ id: data.userId } as any) : null,
            });

            await bookingRepo.save(newBooking);
            await queryRunner.commitTransaction();

            logger.info(`Asiento reservado: ${newBooking.id} | Asiento: ${data.seatId} | Precio: S/${calculatedPrice}`);
            // Precio "de sistema" (sin el ajuste manual, si lo hubo) — no se
            // persiste, solo viaja en la respuesta para que el controller
            // pueda auditar la diferencia si actorRole ajustó el precio.
            (newBooking as any).systemPrice = systemPrice;
            return newBooking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Confirma una reserva (RESERVED) hacia una venta real, en efectivo o
     * digital. El asiento ya estaba bloqueado desde reserveSeat(), así que
     * acá no hace falta repetir la validación de overbooking.
     * Permitido para staff (ADMIN/SUPER_ADMIN/AGENCY_SELLER/DRIVER) de la
     * MISMA empresa del viaje -- cualquiera de ellos, no solo quien la creó.
     */
    public async confirmReservation(
        bookingId: string,
        method: 'cash' | 'digital',
        actorRole: UserRole | undefined,
        actorCompanyId: string | undefined,
        paymentGateway?: PaymentGateway,
        paymentDetails?: PaymentDetails,
    ): Promise<BookingEntity> {
        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const booking = await bookingRepo.findOne({
            where: { id: bookingId },
            relations: { trip: { route: { company: true } } },
        });

        if (!booking) throw new Error('Reserva no encontrada');

        const staffRoles = [UserRole.ADMIN, UserRole.AGENCY_SELLER, UserRole.DRIVER];
        const isStaffOfSameCompany =
            actorRole === UserRole.SUPER_ADMIN ||
            (!!actorRole && staffRoles.includes(actorRole) && actorCompanyId === booking.trip.route.company.id);

        if (!isStaffOfSameCompany) {
            throw new Error('No tienes permisos para confirmar esta reserva');
        }

        if (booking.paymentStatus !== PaymentStatus.RESERVED) {
            throw new Error(`No se puede confirmar una reserva con estado: ${booking.paymentStatus}`);
        }

        if (method === 'cash') {
            booking.paymentStatus = PaymentStatus.PENDING_CASH;
            booking.paymentMethod = 'CASH';
            await bookingRepo.save(booking);
            logger.info(`Reserva confirmada (efectivo): ${bookingId}`);
            return booking;
        }

        if (!paymentGateway || !paymentDetails) {
            throw new Error('paymentDetails es requerido para confirmar con pago digital');
        }

        paymentDetails.amount = Number(booking.totalPrice);
        const paymentResult = await paymentGateway.processPayment(paymentDetails);

        if (!paymentResult.success) {
            // Dejar la reserva como estaba (RESERVED) -- el asiento sigue
            // apartado, staff puede reintentar o confirmar en efectivo.
            throw new Error(`Pago rechazado: ${paymentResult.errorMessage}`);
        }

        booking.paymentStatus = PaymentStatus.PAID_DIGITAL;
        booking.paymentMethod = paymentDetails.method as string;
        booking.paymentGatewayRef = paymentResult.transactionId ?? '';
        await bookingRepo.save(booking);

        logger.info(`Reserva confirmada (digital): ${bookingId} | Ref: ${booking.paymentGatewayRef}`);
        return booking;
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
     * Cancelar una reserva y liberar su asiento (permitido en cualquier estado
     * activo: RESERVED, PENDING_CASH, PENDING_DIGITAL, PAID_DIGITAL o PAID --
     * no solo las pendientes de pago, ya que el caso de uso principal es "el
     * pasajero ya pagó pero ya no viaja" (o, para RESERVED, simplemente nadie
     * confirmó el asiento apartado). No permitido si ya está CANCELLED, FAILED
     * o REFUNDED (estados terminales).
     * Permitido para: (a) el usuario dueño de la reserva, o (b) staff
     * (ADMIN/SUPER_ADMIN/AGENCY_SELLER/DRIVER) de la MISMA empresa del viaje.
     * Antes, `userId` se recibía pero nunca se verificaba — cualquier usuario
     * autenticado podía cancelar cualquier reserva de cualquier empresa.
     *
     * Nota: esto NO procesa ningún reembolso -- solo libera el asiento a nivel
     * de inventario. Si el pasajero ya pagó, el reembolso (si aplica) se
     * gestiona manualmente por fuera del sistema hasta que haya una pasarela
     * de pago real integrada.
     */
    public async cancelBooking(
        bookingId: string,
        userId?: string,
        actorRole?: UserRole,
        actorCompanyId?: string,
    ): Promise<BookingEntity> {
        const bookingRepo = AppDataSource.getRepository(BookingEntity);
        const booking = await bookingRepo.findOne({
            where: { id: bookingId },
            relations: { user: true, trip: { route: { company: true } } },
        });

        if (!booking) throw new Error('Reserva no encontrada');

        const isOwner = !!userId && booking.user?.id === userId;
        const staffRoles = [UserRole.ADMIN, UserRole.AGENCY_SELLER, UserRole.DRIVER];
        const isStaffOfSameCompany =
            actorRole === UserRole.SUPER_ADMIN ||
            (!!actorRole && staffRoles.includes(actorRole) && actorCompanyId === booking.trip.route.company.id);

        if (!isOwner && !isStaffOfSameCompany) {
            throw new Error('No tienes permisos para cancelar esta reserva');
        }

        const cancellableStatuses = [
            PaymentStatus.RESERVED,
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PENDING_DIGITAL,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];
        if (!cancellableStatuses.includes(booking.paymentStatus)) {
            throw new Error(`No se puede cancelar una reserva con estado: ${booking.paymentStatus}`);
        }

        booking.paymentStatus = PaymentStatus.CANCELLED;
        await bookingRepo.save(booking);

        logger.info(`Reserva cancelada: ${bookingId}`);

        // No exponer credenciales del pasajero (passwordHash/refreshToken) en
        // la respuesta -- la relación `user` de arriba trae la entidad
        // completa, y cuando quien cancela es staff (no el dueño), no debe
        // recibir esos campos del pasajero.
        if (booking.user) {
            const { passwordHash: _, refreshToken: __, ...safeUser } = booking.user;
            (booking as any).user = safeUser;
        }
        return booking;
    }
}
