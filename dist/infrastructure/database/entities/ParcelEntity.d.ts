import { TripEntity } from './TripEntity';
import { RouteWaypointEntity } from './RouteWaypointEntity';
import { PaymentStatus } from './BookingEntity';
export declare enum ParcelStatus {
    RECEIVED = "RECEIVED",
    IN_TRANSIT = "IN_TRANSIT",
    READY_FOR_PICKUP = "READY_FOR_PICKUP",
    DELIVERED = "DELIVERED"
}
export declare class ParcelEntity {
    id: string;
    trip: TripEntity;
    senderName: string;
    senderDoc: string;
    receiverName: string;
    receiverDoc: string;
    startWaypoint: RouteWaypointEntity;
    endWaypoint: RouteWaypointEntity;
    description: string;
    weightKg: number;
    totalPrice: number;
    status: ParcelStatus;
    paymentStatus: PaymentStatus;
    createdAt: Date;
}
//# sourceMappingURL=ParcelEntity.d.ts.map