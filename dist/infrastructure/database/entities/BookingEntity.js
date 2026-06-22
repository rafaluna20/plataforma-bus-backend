"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingEntity = exports.PaymentStatus = void 0;
const typeorm_1 = require("typeorm");
const TripEntity_1 = require("./TripEntity");
const RouteWaypointEntity_1 = require("./RouteWaypointEntity");
const UserEntity_1 = require("./UserEntity");
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING_CASH"] = "PENDING_CASH";
    PaymentStatus["PENDING_DIGITAL"] = "PENDING_DIGITAL";
    PaymentStatus["PAID_DIGITAL"] = "PAID_DIGITAL";
    PaymentStatus["FAILED"] = "FAILED";
    PaymentStatus["PAID"] = "PAID";
    PaymentStatus["CANCELLED"] = "CANCELLED";
    PaymentStatus["REFUNDED"] = "REFUNDED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
let BookingEntity = class BookingEntity {
    // Precio de la reserva (alias de totalPrice para compatibilidad)
    get price() {
        return Number(this.totalPrice);
    }
};
exports.BookingEntity = BookingEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BookingEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => TripEntity_1.TripEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'trip_id' }),
    __metadata("design:type", TripEntity_1.TripEntity)
], BookingEntity.prototype, "trip", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'passenger_name', type: 'varchar', length: 150 }),
    __metadata("design:type", String)
], BookingEntity.prototype, "passengerName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'passenger_doc_type', type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], BookingEntity.prototype, "passengerDocType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'passenger_doc_num', type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], BookingEntity.prototype, "passengerDocNum", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RouteWaypointEntity_1.RouteWaypointEntity),
    (0, typeorm_1.JoinColumn)({ name: 'start_waypoint_id' }),
    __metadata("design:type", RouteWaypointEntity_1.RouteWaypointEntity)
], BookingEntity.prototype, "startWaypoint", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RouteWaypointEntity_1.RouteWaypointEntity),
    (0, typeorm_1.JoinColumn)({ name: 'end_waypoint_id' }),
    __metadata("design:type", RouteWaypointEntity_1.RouteWaypointEntity)
], BookingEntity.prototype, "endWaypoint", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'seat_id', type: 'varchar', length: 10 }),
    __metadata("design:type", String)
], BookingEntity.prototype, "seatId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], BookingEntity.prototype, "totalPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_status', type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING_CASH }),
    __metadata("design:type", String)
], BookingEntity.prototype, "paymentStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_method', type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", String)
], BookingEntity.prototype, "paymentMethod", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_gateway_ref', type: 'varchar', length: 150, nullable: true }),
    __metadata("design:type", String)
], BookingEntity.prototype, "paymentGatewayRef", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'culqi_charge_id', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", String)
], BookingEntity.prototype, "culqiChargeId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => UserEntity_1.UserEntity, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", UserEntity_1.UserEntity)
], BookingEntity.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], BookingEntity.prototype, "createdAt", void 0);
exports.BookingEntity = BookingEntity = __decorate([
    (0, typeorm_1.Entity)('bookings'),
    (0, typeorm_1.Unique)('unique_seat_trip_booking', ['trip', 'seatId', 'startWaypoint'])
], BookingEntity);
//# sourceMappingURL=BookingEntity.js.map