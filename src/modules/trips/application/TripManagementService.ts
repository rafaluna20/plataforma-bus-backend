import { AppDataSource } from '../../../infrastructure/database/data-source';
import { TripEntity, TripStatus } from '../domain/TripEntity';
import { RouteEntity } from '../../../infrastructure/database/entities/RouteEntity';
import { VehicleEntity } from '../../../infrastructure/database/entities/VehicleEntity';
import { UserEntity, UserRole } from '../../../infrastructure/database/entities/UserEntity';
import { BookingEntity, PaymentStatus } from '../../bookings/domain/BookingEntity';
import { logger } from '../../../infrastructure/logger';
import { emitToTrip } from '../../../infrastructure/sockets/SocketBus';
import { assertSameCompany } from '../../../infrastructure/auth/companyScope';

export interface CreateTripDTO {
    routeId: string;
    vehicleId: string;
    departureTime: Date;
    driverId?: string; // Conductor asignado (opcional)
    actorRole?: UserRole;
    actorCompanyId?: string;
}

export interface UpdateTripStatusDTO {
    tripId: string;
    status: TripStatus;
    actorRole?: UserRole; // Rol del usuario que ejecuta la transición (valida permisos finos por estado destino)
    actorCompanyId?: string;
}

// Roles autorizados a establecer cada estado destino. AGENCY_SELLER puede autorizar
// el abordaje (BOARDING/IN_TRANSIT) pero no confirmar llegada (COMPLETED) ni cancelar.
const ROLES_ALLOWED_PER_STATUS: Partial<Record<TripStatus, UserRole[]>> = {
    [TripStatus.BOARDING]:   [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER, UserRole.AGENCY_SELLER],
    [TripStatus.IN_TRANSIT]: [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER, UserRole.AGENCY_SELLER],
    [TripStatus.COMPLETED]:  [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER],
    [TripStatus.CANCELLED]:  [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER],
};

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export class TripManagementService {
    private get tripRepo() {
        return AppDataSource.getRepository(TripEntity);
    }

    /**
     * Valida un conductor para asignarlo a un viaje y lo devuelve.
     * Verifica: existe, rol DRIVER, activo, pertenece a la empresa indicada,
     * y no tiene otro viaje activo el mismo día (anti doble-asignación).
     */
    private async validateDriverForTrip(
        driverId: string,
        companyId: string,
        departureDate: Date,
        excludeTripId?: string,
    ): Promise<UserEntity> {
        const userRepo = AppDataSource.getRepository(UserEntity);
        const driver = await userRepo.findOne({
            where: { id: driverId },
            relations: { company: true },
        });

        if (!driver) throw new Error('Conductor no encontrado');
        if (driver.role !== UserRole.DRIVER) throw new Error('El usuario seleccionado no es un conductor');
        if (!driver.isActive) throw new Error('El conductor está inactivo y no puede ser asignado');
        if (!driver.company || driver.company.id !== companyId) {
            throw new Error('El conductor debe pertenecer a la misma empresa que la ruta');
        }

        // Anti doble-asignación: el conductor no puede tener otro viaje activo el mismo día
        const conflictQb = this.tripRepo
            .createQueryBuilder('trip')
            .where('trip.driver_id = :driverId', { driverId })
            .andWhere('trip.status IN (:...activeStatuses)', {
                activeStatuses: [TripStatus.SCHEDULED, TripStatus.BOARDING, TripStatus.IN_TRANSIT],
            })
            .andWhere('DATE(trip.departure_time) = DATE(:departureDate)', { departureDate });

        if (excludeTripId) {
            conflictQb.andWhere('trip.id != :excludeTripId', { excludeTripId });
        }

        const conflicting = await conflictQb.getOne();
        if (conflicting) {
            throw new Error(`El conductor ${driver.name} ya tiene un viaje asignado para esa fecha`);
        }

        return driver;
    }

    /** Devuelve solo los campos públicos del conductor (sin hash de contraseña ni tokens). */
    private sanitizeDriver(driver: UserEntity | null): { id: string; name: string; phone: string | null; docNum: string | null } | null {
        if (!driver) return null;
        return {
            id: driver.id,
            name: driver.name,
            phone: driver.phone ?? null,
            docNum: driver.docNum ?? null,
        };
    }

    /** Reemplaza el objeto driver completo por su versión saneada en un viaje (o lista). */
    private sanitizeTripDrivers<T extends TripEntity | TripEntity[]>(trips: T): T {
        const list = Array.isArray(trips) ? trips : [trips];
        for (const trip of list) {
            if ('driver' in trip) {
                (trip as any).driver = this.sanitizeDriver(trip.driver);
            }
        }
        return trips;
    }

    /** Programar una nueva salida/viaje */
    public async create(data: CreateTripDTO): Promise<TripEntity> {
        const routeRepo = AppDataSource.getRepository(RouteEntity);
        const vehicleRepo = AppDataSource.getRepository(VehicleEntity);

        const route = await routeRepo.findOne({ where: { id: data.routeId }, relations: { company: true } });
        if (!route) throw new Error('Ruta no encontrada');

        const vehicle = await vehicleRepo.findOne({ where: { id: data.vehicleId }, relations: { company: true } });
        if (!vehicle) throw new Error('Vehículo no encontrado');

        // Validar que la ruta y el vehículo pertenezcan a la misma empresa
        if (route.company.id !== vehicle.company.id) {
            throw new Error('El vehículo y la ruta deben pertenecer a la misma empresa');
        }

        // Un ADMIN solo puede programar viajes para SU propia empresa (SUPER_ADMIN sin restricción)
        assertSameCompany(data.actorRole, data.actorCompanyId, route.company.id);

        // Validar que el vehículo esté activo
        if (!vehicle.isActive) {
            throw new Error(`El vehículo ${vehicle.plateNumber} está inactivo y no puede ser asignado a un viaje`);
        }

        // Validar que la fecha de salida sea futura
        if (new Date(data.departureTime) <= new Date()) {
            throw new Error('La fecha de salida debe ser en el futuro');
        }

        // Validar que el vehículo no tenga otro viaje activo en la misma fecha/hora
        const departureDate = new Date(data.departureTime);
        const conflictingTrip = await this.tripRepo
            .createQueryBuilder('trip')
            .where('trip.vehicle_id = :vehicleId', { vehicleId: data.vehicleId })
            .andWhere('trip.status IN (:...activeStatuses)', {
                activeStatuses: [TripStatus.SCHEDULED, TripStatus.BOARDING, TripStatus.IN_TRANSIT],
            })
            .andWhere('DATE(trip.departure_time) = DATE(:departureDate)', { departureDate })
            .getOne();

        if (conflictingTrip) {
            throw new Error(`El vehículo ${vehicle.plateNumber} ya tiene un viaje programado para esa fecha`);
        }

        // Validar y resolver el conductor si se proporcionó (es opcional)
        let driver: UserEntity | null = null;
        if (data.driverId) {
            driver = await this.validateDriverForTrip(data.driverId, route.company.id, departureDate);
        }

        const trip = this.tripRepo.create({
            route,
            vehicle,
            driver,
            departureTime: departureDate,
            status: TripStatus.SCHEDULED,
        });

        const saved = await this.tripRepo.save(trip);
        logger.info(`Viaje programado: ${saved.id} | Ruta: ${route.name} | Vehículo: ${vehicle.plateNumber} | Conductor: ${driver?.name ?? 'sin asignar'} | Salida: ${departureDate.toISOString()}`);
        return this.sanitizeTripDrivers(saved);
    }

    /**
     * Actualizar datos de un viaje (reprogramar fecha/hora, cambiar vehículo o conductor).
     * driverId: undefined = no tocar; null o '' = quitar conductor; uuid = asignar/cambiar.
     */
    public async update(
        tripId: string,
        data: { departureTime?: Date; vehicleId?: string; driverId?: string | null; actorRole?: UserRole; actorCompanyId?: string },
    ): Promise<TripEntity> {
        const trip = await this.tripRepo.findOne({
            where: { id: tripId },
            relations: { route: { company: true }, vehicle: true, driver: true },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        assertSameCompany(data.actorRole, data.actorCompanyId, trip.route.company.id);

        // Solo permitir editar viajes PROGRAMADOS
        if (trip.status !== TripStatus.SCHEDULED) {
            throw new Error('Solo se pueden editar viajes en estado Programado (SCHEDULED)');
        }

        const vehicleRepo = AppDataSource.getRepository(VehicleEntity);

        if (data.vehicleId && data.vehicleId !== trip.vehicle.id) {
            const vehicle = await vehicleRepo.findOne({ where: { id: data.vehicleId }, relations: { company: true } });
            if (!vehicle) throw new Error('Vehículo no encontrado');
            
            // Validar que el vehículo esté activo
            if (!vehicle.isActive) {
                throw new Error(`El vehículo ${vehicle.plateNumber} está inactivo`);
            }

            // Validar que pertenezca a la misma empresa
            const routeRepo = AppDataSource.getRepository(RouteEntity);
            const route = await routeRepo.findOne({ where: { id: trip.route.id }, relations: { company: true } });
            if (route && route.company.id !== vehicle.company.id) {
                throw new Error('El vehículo debe pertenecer a la misma empresa que la ruta');
            }

            trip.vehicle = vehicle;
        }

        const newDepartureTime = data.departureTime ? new Date(data.departureTime) : trip.departureTime;

        if (data.departureTime) {
            // Validar que la nueva fecha sea futura
            if (newDepartureTime <= new Date()) {
                throw new Error('La fecha de salida debe ser en el futuro');
            }
            trip.departureTime = newDepartureTime;
        }

        // Validar conflicto de horario para el vehículo asignado en la nueva fecha/hora (si cambió la hora o el vehículo)
        if (data.departureTime || data.vehicleId) {
            const conflictingTrip = await this.tripRepo
                .createQueryBuilder('trip')
                .where('trip.vehicle_id = :vehicleId', { vehicleId: trip.vehicle.id })
                .andWhere('trip.id != :tripId', { tripId })
                .andWhere('trip.status IN (:...activeStatuses)', {
                    activeStatuses: [TripStatus.SCHEDULED, TripStatus.BOARDING, TripStatus.IN_TRANSIT],
                })
                .andWhere('DATE(trip.departure_time) = DATE(:newDepartureTime)', { newDepartureTime })
                .getOne();

            if (conflictingTrip) {
                throw new Error(`El vehículo ${trip.vehicle.plateNumber} ya tiene un viaje programado para esa fecha`);
            }
        }

        // Conductor: undefined = no tocar; null/'' = quitar; uuid = validar y asignar
        if (data.driverId !== undefined) {
            if (!data.driverId) {
                trip.driver = null;
            } else {
                trip.driver = await this.validateDriverForTrip(
                    data.driverId,
                    trip.route.company.id,
                    newDepartureTime,
                    tripId,
                );
            }
        }

        const saved = await this.tripRepo.save(trip);
        logger.info(`Viaje reprogramado: ${saved.id} | Nueva salida: ${saved.departureTime.toISOString()} | Vehículo: ${saved.vehicle.plateNumber} | Conductor: ${saved.driver?.name ?? 'sin asignar'}`);
        return this.sanitizeTripDrivers(saved);
    }

    /** Actualizar el estado de un viaje (Programado → Abordando → En Tránsito → Finalizado) */
    public async updateStatus(data: UpdateTripStatusDTO): Promise<TripEntity> {
        const trip = await this.tripRepo.findOne({
            where: { id: data.tripId },
            relations: { route: { company: true } },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        assertSameCompany(data.actorRole, data.actorCompanyId, trip.route.company.id);

        // Validar transiciones de estado válidas
        const validTransitions: Record<TripStatus, TripStatus[]> = {
            [TripStatus.SCHEDULED]: [TripStatus.BOARDING, TripStatus.CANCELLED],
            [TripStatus.BOARDING]: [TripStatus.IN_TRANSIT, TripStatus.CANCELLED],
            [TripStatus.IN_TRANSIT]: [TripStatus.COMPLETED],
            [TripStatus.COMPLETED]: [],
            [TripStatus.CANCELLED]: [],
        };

        if (!validTransitions[trip.status].includes(data.status)) {
            throw new Error(`No se puede cambiar de "${trip.status}" a "${data.status}"`);
        }

        const allowedRoles = ROLES_ALLOWED_PER_STATUS[data.status];
        if (data.actorRole && allowedRoles && !allowedRoles.includes(data.actorRole)) {
            throw new Error(`Tu rol (${data.actorRole}) no está autorizado para cambiar el viaje a "${data.status}"`);
        }

        const previousStatus = trip.status;
        trip.status = data.status;
        const updated = await this.tripRepo.save(trip);

        logger.info(`Estado de viaje actualizado: ${data.tripId} | ${previousStatus} → ${data.status}`);

        // Avisar en vivo a quien tenga abierta la página de rastreo de este viaje
        // (misma sala `trip_{tripId}` que usa el GPS del conductor).
        emitToTrip(updated.id, 'trip_status_changed', {
            tripId: updated.id,
            previousStatus,
            status: updated.status,
            departureTime: updated.departureTime,
            timestamp: new Date().toISOString(),
        });

        // El paso a BOARDING es el momento en que un humano en el terminal confirma que
        // el vehículo está por salir — es el aviso "definitivo" para los pasajeros que
        // ya compraron pasaje (ver plan: la hora programada sola no es confiable porque
        // los viajes se adelantan/atrasan en la práctica).
        if (updated.status === TripStatus.BOARDING) {
            emitToTrip(updated.id, 'boarding_started', {
                tripId: updated.id,
                departureTime: updated.departureTime,
                message: 'El vehículo está abordando pasajeros. Dirígete al andén de salida.',
                timestamp: new Date().toISOString(),
            });
        }

        return updated;
    }

    /** Listar viajes de una empresa con filtros opcionales y paginación */
    public async findByCompany(
        companyId: string,
        status?: TripStatus,
        options: PaginationOptions = {},
        actorRole?: UserRole,
        actorCompanyId?: string,
    ): Promise<{ data: TripEntity[]; total: number; page: number; totalPages: number }> {
        assertSameCompany(actorRole, actorCompanyId, companyId);

        const page = Math.max(1, options.page || 1);
        const limit = Math.min(100, Math.max(1, options.limit || 20));
        const skip = (page - 1) * limit;

        const query = this.tripRepo.createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            .innerJoinAndSelect('route.company', 'company')
            .leftJoinAndSelect('trip.driver', 'driver')
            .where('company.id = :companyId', { companyId })
            .orderBy('trip.departure_time', 'DESC')
            .skip(skip)
            .take(limit);

        if (status) {
            query.andWhere('trip.status = :status', { status });
        }

        const [data, total] = await query.getManyAndCount();

        return {
            data: this.sanitizeTripDrivers(data),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Listar los viajes asignados a un conductor (para su panel).
     * Por defecto solo viajes activos (no finalizados ni cancelados).
     */
    public async findByDriver(driverId: string): Promise<TripEntity[]> {
        const trips = await this.tripRepo.createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('route.waypoints', 'waypoints')
            .innerJoinAndSelect('waypoints.station', 'station')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            .innerJoinAndSelect('route.company', 'company')
            .leftJoinAndSelect('trip.driver', 'driver')
            .where('trip.driver_id = :driverId', { driverId })
            .andWhere('trip.status IN (:...activeStatuses)', {
                activeStatuses: [TripStatus.SCHEDULED, TripStatus.BOARDING, TripStatus.IN_TRANSIT],
            })
            .orderBy('trip.departure_time', 'ASC')
            .getMany();

        trips.forEach(trip => {
            if (trip.route?.waypoints) {
                trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
            }
        });

        return this.sanitizeTripDrivers(trips);
    }

    /**
     * Verifica si un conductor está asignado a un viaje específico.
     * Usado por el gateway de GPS para autorizar la emisión de ubicación.
     */
    public async isDriverAssignedToTrip(driverId: string, tripId: string): Promise<boolean> {
        const count = await this.tripRepo.count({
            where: { id: tripId, driver: { id: driverId } },
        });
        return count > 0;
    }

    /** Obtener viaje por ID con detalle completo (ruta, waypoints, vehículo) */
    public async findById(id: string, actorRole?: UserRole, actorCompanyId?: string): Promise<TripEntity> {
        const trip = await this.tripRepo.findOne({
            where: { id },
            relations: { route: { waypoints: { station: true }, company: true }, vehicle: true, driver: true },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        assertSameCompany(actorRole, actorCompanyId, trip.route.company.id);

        // Ordenar waypoints por stop_order
        if (trip.route?.waypoints) {
            trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
        }

        return this.sanitizeTripDrivers(trip);
    }

    /** Obtener el manifiesto de pasajeros de un viaje (CORREGIDO: incluye todos los estados activos) */
    public async getPassengerManifest(tripId: string, actorRole?: UserRole, actorCompanyId?: string) {
        const trip = await this.tripRepo.findOne({
            where: { id: tripId },
            relations: { route: { company: true } },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        assertSameCompany(actorRole, actorCompanyId, trip.route.company.id);

        const bookingRepo = AppDataSource.getRepository(BookingEntity);

        // CORRECCIÓN: Incluir PENDING_CASH, PAID_DIGITAL y PAID (todos los estados activos)
        const activeStatuses = [
            PaymentStatus.PENDING_CASH,
            PaymentStatus.PAID_DIGITAL,
            PaymentStatus.PAID,
        ];

        const bookings = await bookingRepo.find({
            where: activeStatuses.map(status => ({
                trip: { id: tripId },
                paymentStatus: status,
            })),
            relations: { startWaypoint: { station: true }, endWaypoint: { station: true } },
            order: { seatId: 'ASC' },
        });

        return bookings.map(b => ({
            bookingId: b.id,
            passengerName: b.passengerName,
            docType: b.passengerDocType,
            docNum: b.passengerDocNum,
            seatId: b.seatId,
            from: b.startWaypoint?.station?.name || 'Origen',
            to: b.endWaypoint?.station?.name || 'Destino',
            price: b.totalPrice,
            paymentStatus: b.paymentStatus,
            paymentMethod: b.paymentMethod || 'CASH',
        }));
    }
}
