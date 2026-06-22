import { TripEntity, TripStatus } from '../../infrastructure/database/entities/TripEntity';
import { PaymentStatus } from '../../infrastructure/database/entities/BookingEntity';
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
export declare class TripManagementService {
    private get tripRepo();
    /** Programar una nueva salida/viaje */
    create(data: CreateTripDTO): Promise<TripEntity>;
    /** Actualizar el estado de un viaje (Programado → Abordando → En Tránsito → Finalizado) */
    updateStatus(data: UpdateTripStatusDTO): Promise<TripEntity>;
    /** Listar viajes de una empresa con filtros opcionales y paginación */
    findByCompany(companyId: string, status?: TripStatus, options?: PaginationOptions): Promise<{
        data: TripEntity[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    /** Obtener viaje por ID con detalle completo (ruta, waypoints, vehículo) */
    findById(id: string): Promise<TripEntity>;
    /** Obtener el manifiesto de pasajeros de un viaje (CORREGIDO: incluye todos los estados activos) */
    getPassengerManifest(tripId: string): Promise<{
        bookingId: string;
        passengerName: string;
        docType: string;
        docNum: string;
        seatId: string;
        from: string;
        to: string;
        price: number;
        paymentStatus: PaymentStatus;
        paymentMethod: string;
    }[]>;
}
//# sourceMappingURL=TripManagementService.d.ts.map