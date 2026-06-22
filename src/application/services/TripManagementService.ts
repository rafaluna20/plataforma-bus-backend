import { AppDataSource } from '../../infrastructure/database/data-source';
import { TripEntity, TripStatus } from '../../infrastructure/database/entities/TripEntity';
import { RouteEntity } from '../../infrastructure/database/entities/RouteEntity';
import { VehicleEntity } from '../../infrastructure/database/entities/VehicleEntity';
import { BookingEntity, PaymentStatus } from '../../infrastructure/database/entities/BookingEntity';
import { logger } from '../../infrastructure/logger';

export interface CreateTripDTO {
    routeId: string;
    vehicleId: string;
    departureTime: Date;
}

export interface UpdateTripStatusDTO {
    tripId: string;
    status: TripStatus;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export class TripManagementService {
    private get tripRepo() {
        return AppDataSource.getRepository(TripEntity);
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

        const trip = this.tripRepo.create({
            route,
            vehicle,
            departureTime: departureDate,
            status: TripStatus.SCHEDULED,
        });

        const saved = await this.tripRepo.save(trip);
        logger.info(`Viaje programado: ${saved.id} | Ruta: ${route.name} | Vehículo: ${vehicle.plateNumber} | Salida: ${departureDate.toISOString()}`);
        return saved;
    }

    /** Actualizar el estado de un viaje (Programado → Abordando → En Tránsito → Finalizado) */
    public async updateStatus(data: UpdateTripStatusDTO): Promise<TripEntity> {
        const trip = await this.tripRepo.findOne({ where: { id: data.tripId } });
        if (!trip) throw new Error('Viaje no encontrado');

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

        const previousStatus = trip.status;
        trip.status = data.status;
        const updated = await this.tripRepo.save(trip);

        logger.info(`Estado de viaje actualizado: ${data.tripId} | ${previousStatus} → ${data.status}`);
        return updated;
    }

    /** Listar viajes de una empresa con filtros opcionales y paginación */
    public async findByCompany(
        companyId: string,
        status?: TripStatus,
        options: PaginationOptions = {}
    ): Promise<{ data: TripEntity[]; total: number; page: number; totalPages: number }> {
        const page = Math.max(1, options.page || 1);
        const limit = Math.min(100, Math.max(1, options.limit || 20));
        const skip = (page - 1) * limit;

        const query = this.tripRepo.createQueryBuilder('trip')
            .innerJoinAndSelect('trip.route', 'route')
            .innerJoinAndSelect('trip.vehicle', 'vehicle')
            .innerJoinAndSelect('route.company', 'company')
            .where('company.id = :companyId', { companyId })
            .orderBy('trip.departure_time', 'DESC')
            .skip(skip)
            .take(limit);

        if (status) {
            query.andWhere('trip.status = :status', { status });
        }

        const [data, total] = await query.getManyAndCount();

        return {
            data,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    /** Obtener viaje por ID con detalle completo (ruta, waypoints, vehículo) */
    public async findById(id: string): Promise<TripEntity> {
        const trip = await this.tripRepo.findOne({
            where: { id },
            relations: { route: { waypoints: { station: true }, company: true }, vehicle: true },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        // Ordenar waypoints por stop_order
        if (trip.route?.waypoints) {
            trip.route.waypoints.sort((a, b) => a.stopOrder - b.stopOrder);
        }

        return trip;
    }

    /** Obtener el manifiesto de pasajeros de un viaje (CORREGIDO: incluye todos los estados activos) */
    public async getPassengerManifest(tripId: string) {
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
