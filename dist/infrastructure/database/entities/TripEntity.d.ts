import { RouteEntity } from './RouteEntity';
import { VehicleEntity } from './VehicleEntity';
export declare enum TripStatus {
    SCHEDULED = "SCHEDULED",
    BOARDING = "BOARDING",
    IN_TRANSIT = "IN_TRANSIT",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export declare class TripEntity {
    id: string;
    route: RouteEntity;
    vehicle: VehicleEntity;
    departureTime: Date;
    status: TripStatus;
    actualLocation: string;
    createdAt: Date;
}
//# sourceMappingURL=TripEntity.d.ts.map