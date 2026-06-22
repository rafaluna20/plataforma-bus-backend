import { TripEntity } from '../../infrastructure/database/entities/TripEntity';
export interface SearchTripsDTO {
    originCity?: string;
    destinationCity?: string;
    travelDate?: Date;
    page?: number;
    limit?: number;
}
export interface SearchTripsResult {
    data: TripEntity[];
    total: number;
    page: number;
    totalPages: number;
    searchParams?: {
        originCity: string;
        destinationCity: string;
        travelDate: Date;
    };
}
export declare class SearchTripsService {
    /**
     * Busca viajes programados que pasen por el origen y destino en el orden correcto
     * y en la fecha solicitada. Usa SQL con JOINs en lugar de filtrado en memoria.
     */
    execute(params: SearchTripsDTO): Promise<unknown>;
}
//# sourceMappingURL=SearchTripsService.d.ts.map