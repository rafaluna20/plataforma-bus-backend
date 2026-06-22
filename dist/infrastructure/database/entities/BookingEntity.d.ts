import { TripEntity } from './TripEntity';
import { RouteWaypointEntity } from './RouteWaypointEntity';
import { UserEntity } from './UserEntity';
export declare enum PaymentStatus {
    PENDING_CASH = "PENDING_CASH",
    PENDING_DIGITAL = "PENDING_DIGITAL",
    PAID_DIGITAL = "PAID_DIGITAL",
    FAILED = "FAILED",
    PAID = "PAID",
    CANCELLED = "CANCELLED",
    REFUNDED = "REFUNDED"
}
export declare class BookingEntity {
    id: string;
    trip: TripEntity;
    passengerName: string;
    passengerDocType: string;
    passengerDocNum: string;
    startWaypoint: RouteWaypointEntity;
    endWaypoint: RouteWaypointEntity;
    seatId: string;
    totalPrice: number;
    paymentStatus: PaymentStatus;
    paymentMethod: string;
    paymentGatewayRef: string;
    culqiChargeId: string | null;
    user: UserEntity | null;
    get price(): number;
    createdAt: Date;
}
//# sourceMappingURL=BookingEntity.d.ts.map