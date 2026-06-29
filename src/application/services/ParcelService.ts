import { AppDataSource } from '../../infrastructure/database/data-source';
import { ParcelEntity, ParcelStatus } from '../../infrastructure/database/entities/ParcelEntity';
import { PaymentStatus } from '../../infrastructure/database/entities/BookingEntity';
import { TripEntity } from '../../infrastructure/database/entities/TripEntity';
import { RouteWaypointEntity } from '../../infrastructure/database/entities/RouteWaypointEntity';
import { logger } from '../../infrastructure/logger';

export interface CreateParcelDTO {
    tripId: string;
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
}

export interface UpdateParcelStatusDTO {
    status: ParcelStatus;
}

export class ParcelService {

    /**
     * Crea una nueva encomienda asociada a un viaje.
     * Valida que el viaje exista y que los waypoints sean válidos.
     */
    public async createParcel(data: CreateParcelDTO): Promise<ParcelEntity> {
        const tripRepo     = AppDataSource.getRepository(TripEntity);
        const waypointRepo = AppDataSource.getRepository(RouteWaypointEntity);
        const parcelRepo   = AppDataSource.getRepository(ParcelEntity);

        // 1. Validar viaje
        const trip = await tripRepo.findOne({ where: { id: data.tripId } });
        if (!trip) throw new Error('Viaje no encontrado');

        // 2. Validar waypoints
        const startWaypoint = await waypointRepo.findOne({ where: { id: data.startWaypointId } });
        const endWaypoint   = await waypointRepo.findOne({ where: { id: data.endWaypointId } });

        if (!startWaypoint || !endWaypoint) {
            throw new Error('Puntos de ruta inválidos');
        }
        if (startWaypoint.stopOrder >= endWaypoint.stopOrder) {
            throw new Error('El origen debe ser antes del destino en la ruta');
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
        });

        await parcelRepo.save(parcel);

        logger.info(
            `Encomienda creada: ${parcel.id} | Remitente: ${data.senderName} → Destinatario: ${data.receiverName} | Precio: S/${data.totalPrice}`
        );

        return parcel;
    }

    /**
     * Obtiene todas las encomiendas de un viaje específico.
     */
    public async getParcelsByTrip(tripId: string): Promise<ParcelEntity[]> {
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);

        return parcelRepo.find({
            where: { trip: { id: tripId } },
            relations: {
                startWaypoint: { station: true },
                endWaypoint:   { station: true },
            },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Actualiza el estado de una encomienda (tracking).
     */
    public async updateParcelStatus(parcelId: string, dto: UpdateParcelStatusDTO): Promise<ParcelEntity> {
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);

        const parcel = await parcelRepo.findOne({ where: { id: parcelId } });
        if (!parcel) throw new Error('Encomienda no encontrada');

        parcel.status = dto.status;
        await parcelRepo.save(parcel);

        logger.info(`Encomienda ${parcelId} actualizada a estado: ${dto.status}`);
        return parcel;
    }

    /**
     * Obtiene una encomienda por ID con todas sus relaciones.
     */
    public async getParcelById(parcelId: string): Promise<ParcelEntity> {
        const parcelRepo = AppDataSource.getRepository(ParcelEntity);

        const parcel = await parcelRepo.findOne({
            where: { id: parcelId },
            relations: {
                trip: { route: { company: true } },
                startWaypoint: { station: true },
                endWaypoint:   { station: true },
            },
        });

        if (!parcel) throw new Error('Encomienda no encontrada');
        return parcel;
    }
}
