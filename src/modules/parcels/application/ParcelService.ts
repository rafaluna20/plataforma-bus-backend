import { Not } from 'typeorm';
import { AppDataSource } from '../../../infrastructure/database/data-source';
import { ParcelEntity, ParcelStatus } from '../domain/ParcelEntity';
import { PaymentStatus } from '../../bookings/domain/BookingEntity';
import { TripEntity } from '../../trips/domain/TripEntity';
import { RouteWaypointEntity } from '../../../infrastructure/database/entities/RouteWaypointEntity';
import { UserEntity, UserRole } from '../../../infrastructure/database/entities/UserEntity';
import { logger } from '../../../infrastructure/logger';
import { assertSameCompany } from '../../../infrastructure/auth/companyScope';

export interface CreateParcelDTO {
    /** Opcional: si no se indica, la encomienda queda "pendiente de asignar" (bandeja). */
    tripId?: string;
    /** Requerido solo cuando no se indica tripId, para saber a qué empresa pertenece. */
    companyId?: string;
    senderName: string;
    senderDoc: string;
    receiverName: string;
    receiverDoc: string;
    startWaypointId: string;
    endWaypointId: string;
    description?: string;
    weightKg?: number;
    totalPrice: number;
    paymentMethod?: string; // CASH | DIGITAL
    sellerId?: string;      // ID del vendedor que registra la encomienda
    actorRole?: UserRole;
    actorCompanyId?: string;
}

export interface UpdateParcelStatusDTO {
    status: ParcelStatus;
}

/** Estados en los que una encomienda ya viaja/viajó y por lo tanto requiere tener un viaje asignado. */
const STATUSES_REQUIRING_TRIP = [ParcelStatus.IN_TRANSIT, ParcelStatus.READY_FOR_PICKUP, ParcelStatus.DELIVERED];

/**
 * Quita passwordHash/refreshToken del vendedor antes de exponer la
 * encomienda por la API (el seller viene como UserEntity completo por la
 * relación de TypeORM).
 */
function sanitizeParcel(parcel: ParcelEntity): ParcelEntity {
    if (parcel.seller) {
        const { passwordHash: _, refreshToken: __, ...safeSeller } = parcel.seller as any;
        parcel.seller = safeSeller;
    }
    return parcel;
}

export class ParcelService {

    /**
     * Crea una nueva encomienda. Si se indica tripId queda asignada a ese
     * viaje; si no, queda "pendiente de asignar" en la bandeja de la empresa
     * (companyId es obligatorio en ese caso) hasta que el personal la asigne
     * a un viaje concreto.
     */
    public async createParcel(data: CreateParcelDTO): Promise<ParcelEntity> {
        const tripRepo     = AppDataSource.getRepository(TripEntity);
        const waypointRepo = AppDataSource.getRepository(RouteWaypointEntity);
        const parcelRepo   = AppDataSource.getRepository(ParcelEntity);

        // 1. Resolver viaje (opcional) y empresa
        let trip: TripEntity | null = null;
        let companyId: string;

        if (data.tripId) {
            trip = await tripRepo.findOne({
                where: { id: data.tripId },
                relations: { route: { company: true } },
            });
            if (!trip) throw new Error('Viaje no encontrado');
            companyId = trip.route.company.id;
        } else {
            if (!data.companyId) {
                throw new Error('companyId es requerido para registrar una encomienda sin viaje asignado');
            }
            companyId = data.companyId;
        }

        // Staff (ADMIN/AGENCY_SELLER/DRIVER) solo registra encomiendas de SU empresa
        assertSameCompany(data.actorRole, data.actorCompanyId, companyId);

        // 2. Validar waypoints (deben ser de la misma ruta, y esa ruta debe ser de la empresa)
        const startWaypoint = await waypointRepo.findOne({
            where: { id: data.startWaypointId },
            relations: { route: { company: true } },
        });
        const endWaypoint = await waypointRepo.findOne({
            where: { id: data.endWaypointId },
            relations: { route: true },
        });

        if (!startWaypoint || !endWaypoint) {
            throw new Error('Puntos de ruta inválidos');
        }
        if (startWaypoint.route.id !== endWaypoint.route.id) {
            throw new Error('El origen y el destino deben pertenecer a la misma ruta');
        }
        if (startWaypoint.route.company.id !== companyId) {
            throw new Error('Los puntos de ruta no pertenecen a esta empresa');
        }
        if (startWaypoint.stopOrder >= endWaypoint.stopOrder) {
            throw new Error('El origen debe ser antes del destino en la ruta');
        }
        if (trip && trip.route.id !== startWaypoint.route.id) {
            throw new Error('El origen/destino no pertenecen a la ruta de este viaje');
        }

        // 3. Validar precio
        if (!data.totalPrice || data.totalPrice <= 0) {
            throw new Error('El precio total debe ser mayor a 0');
        }

        // 4. Determinar estado de pago según método
        const paymentStatus =
            data.paymentMethod === 'DIGITAL'
                ? PaymentStatus.PAID_DIGITAL
                : PaymentStatus.PENDING_CASH;

        // 5. Crear encomienda
        let seller: UserEntity | null = null;
        if (data.sellerId) {
            const userRepo = AppDataSource.getRepository(UserEntity);
            seller = await userRepo.findOne({ where: { id: data.sellerId } }) ?? null;
        }

        const parcel = parcelRepo.create({
            trip,
            senderName:   data.senderName,
            senderDoc:    data.senderDoc,
            receiverName: data.receiverName,
            receiverDoc:  data.receiverDoc,
            startWaypoint,
            endWaypoint,
            description:  data.description ?? null,
            weightKg:     data.weightKg    ?? null,
            totalPrice:   data.totalPrice,
            status:       ParcelStatus.RECEIVED,
            paymentStatus,
            seller,
        });

        await parcelRepo.save(parcel);

        logger.info(
            `Encomienda creada: ${parcel.id} | Remitente: ${data.senderName} → Destinatario: ${data.receiverName} | Precio: S/${data.totalPrice} | Viaje: ${trip?.id ?? 'sin asignar'}`
        );

        return sanitizeParcel(parcel);
    }

    /**
     * Obtiene las encomiendas de un viaje específico. Las CANCELADAS se
     * excluyen: ya no forman parte de la carga del viaje — no deben sumar en
     * la barra de capacidad, ni salir en el manifiesto de encomiendas, ni
     * contar en las estadísticas de vendedores.
     */
    public async getParcelsByTrip(tripId: string, actorRole?: UserRole, actorCompanyId?: string): Promise<ParcelEntity[]> {
        const tripRepo = AppDataSource.getRepository(TripEntity);
        const trip = await tripRepo.findOne({
            where: { id: tripId },
            relations: { route: { company: true } },
        });
        if (!trip) throw new Error('Viaje no encontrado');

        assertSameCompany(actorRole, actorCompanyId, trip.route.company.id);

        const parcelRepo = AppDataSource.getRepository(ParcelEntity);

        const parcels = await parcelRepo.find({
            where: { trip: { id: tripId }, status: Not(ParcelStatus.CANCELLED) },
            relations: {
                startWaypoint: { station: true },
                endWaypoint:   { station: true },
                seller:        true,
            },
            order: { createdAt: 'DESC' },
        });
        return parcels.map(sanitizeParcel);
    }

    /**
     * Empresa dueña de una encomienda: si tiene viaje asignado, la del viaje;
     * si está en la bandeja (sin viaje), la de la ruta de sus waypoints.
     * Requiere que `parcel.trip.route.company` y/o
     * `parcel.startWaypoint.route.company` vengan cargados.
     */
    private resolveParcelCompanyId(parcel: ParcelEntity): string {
        return parcel.trip?.route?.company?.id ?? parcel.startWaypoint.route.company.id;
    }

    /**
     * Actualiza el estado de una encomienda (tracking). No se puede avanzar
     * más allá de RECIBIDO sin tener un viaje asignado.
     */
    public async updateParcelStatus(
        parcelId: string,
        dto: UpdateParcelStatusDTO,
        actorRole?: UserRole,
        actorCompanyId?: string,
    ): Promise<ParcelEntity> {
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);

        const parcel = await parcelRepo.findOne({
            where: { id: parcelId },
            relations: {
                trip: { route: { company: true } },
                startWaypoint: { route: { company: true } },
            },
        });
        if (!parcel) throw new Error('Encomienda no encontrada');

        assertSameCompany(actorRole, actorCompanyId, this.resolveParcelCompanyId(parcel));

        if (STATUSES_REQUIRING_TRIP.includes(dto.status) && !parcel.trip) {
            throw new Error('Debes asignar un viaje a la encomienda antes de avanzar su estado');
        }

        parcel.status = dto.status;
        await parcelRepo.save(parcel);

        logger.info(`Encomienda ${parcelId} actualizada a estado: ${dto.status}`);
        return parcel;
    }

    /**
     * Obtiene una encomienda por ID con todas sus relaciones.
     */
    public async getParcelById(parcelId: string, actorRole?: UserRole, actorCompanyId?: string): Promise<ParcelEntity> {
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);

        const parcel = await parcelRepo.findOne({
            where: { id: parcelId },
            relations: {
                trip: { route: { company: true } },
                startWaypoint: { station: true, route: { company: true } },
                endWaypoint:   { station: true },
            },
        });

        if (!parcel) throw new Error('Encomienda no encontrada');

        assertSameCompany(actorRole, actorCompanyId, this.resolveParcelCompanyId(parcel));

        return parcel;
    }

    /**
     * Lista las encomiendas "pendientes de asignar" (sin viaje) de una
     * empresa — la bandeja global. Filtrable por tramo exacto.
     */
    public async getPendingParcels(
        companyId: string,
        filters: { startWaypointId?: string; endWaypointId?: string } = {},
        actorRole?: UserRole,
        actorCompanyId?: string,
    ): Promise<ParcelEntity[]> {
        assertSameCompany(actorRole, actorCompanyId, companyId);

        const parcelRepo = AppDataSource.getRepository(ParcelEntity);
        const qb = parcelRepo.createQueryBuilder('parcel')
            .leftJoinAndSelect('parcel.startWaypoint', 'startWaypoint')
            .leftJoinAndSelect('startWaypoint.station', 'startStation')
            .leftJoinAndSelect('startWaypoint.route', 'startRoute')
            .leftJoinAndSelect('parcel.endWaypoint', 'endWaypoint')
            .leftJoinAndSelect('endWaypoint.station', 'endStation')
            .leftJoinAndSelect('parcel.seller', 'seller')
            .where('parcel.trip_id IS NULL')
            .andWhere('startRoute.company_id = :companyId', { companyId })
            // Una encomienda cancelada no está "pendiente de asignar" — ya no viaja.
            .andWhere('parcel.status != :cancelled', { cancelled: ParcelStatus.CANCELLED });

        if (filters.startWaypointId) {
            qb.andWhere('parcel.start_waypoint_id = :sw', { sw: filters.startWaypointId });
        }
        if (filters.endWaypointId) {
            qb.andWhere('parcel.end_waypoint_id = :ew', { ew: filters.endWaypointId });
        }

        qb.orderBy('parcel.createdAt', 'DESC');
        const parcels = await qb.getMany();
        return parcels.map(sanitizeParcel);
    }

    /**
     * Asigna, reasigna o "desasigna" (vuelve a la bandeja, newTripId=null)
     * una encomienda. Solo se permite reasignar encomiendas que no estén ya
     * entregadas o canceladas, y el viaje destino debe cubrir la misma ruta.
     */
    public async reassignParcel(
        parcelId: string,
        newTripId: string | null,
        actorRole?: UserRole,
        actorCompanyId?: string,
    ): Promise<ParcelEntity> {
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);
        const tripRepo   = AppDataSource.getRepository(TripEntity);

        const parcel = await parcelRepo.findOne({
            where: { id: parcelId },
            relations: {
                trip: { route: { company: true } },
                startWaypoint: { route: { company: true } },
            },
        });
        if (!parcel) throw new Error('Encomienda no encontrada');

        const companyId = this.resolveParcelCompanyId(parcel);
        assertSameCompany(actorRole, actorCompanyId, companyId);

        if (parcel.status === ParcelStatus.DELIVERED || parcel.status === ParcelStatus.CANCELLED) {
            throw new Error('No se puede reasignar una encomienda entregada o cancelada');
        }

        const previousTripId = parcel.trip?.id ?? null;

        if (!newTripId) {
            parcel.trip = null;
        } else {
            const newTrip = await tripRepo.findOne({
                where: { id: newTripId },
                relations: { route: { company: true } },
            });
            if (!newTrip) throw new Error('Viaje no encontrado');
            if (newTrip.route.company.id !== companyId) {
                throw new Error('No puedes reasignar a un viaje de otra empresa');
            }
            if (newTrip.route.id !== parcel.startWaypoint.route.id) {
                throw new Error('El viaje seleccionado no cubre la misma ruta de la encomienda');
            }
            parcel.trip = newTrip;
        }

        await parcelRepo.save(parcel);

        logger.info(`Encomienda ${parcelId} reasignada: ${previousTripId ?? 'sin viaje'} → ${newTripId ?? 'sin viaje'}`);
        return parcel;
    }
}
