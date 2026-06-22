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
exports.ParcelEntity = exports.ParcelStatus = void 0;
const typeorm_1 = require("typeorm");
const TripEntity_1 = require("./TripEntity");
const RouteWaypointEntity_1 = require("./RouteWaypointEntity");
const BookingEntity_1 = require("./BookingEntity");
var ParcelStatus;
(function (ParcelStatus) {
    ParcelStatus["RECEIVED"] = "RECEIVED";
    ParcelStatus["IN_TRANSIT"] = "IN_TRANSIT";
    ParcelStatus["READY_FOR_PICKUP"] = "READY_FOR_PICKUP";
    ParcelStatus["DELIVERED"] = "DELIVERED";
})(ParcelStatus || (exports.ParcelStatus = ParcelStatus = {}));
let ParcelEntity = class ParcelEntity {
};
exports.ParcelEntity = ParcelEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ParcelEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => TripEntity_1.TripEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'trip_id' }),
    __metadata("design:type", TripEntity_1.TripEntity)
], ParcelEntity.prototype, "trip", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sender_name', type: 'varchar', length: 150 }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "senderName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sender_doc', type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "senderDoc", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receiver_name', type: 'varchar', length: 150 }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "receiverName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receiver_doc', type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "receiverDoc", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RouteWaypointEntity_1.RouteWaypointEntity),
    (0, typeorm_1.JoinColumn)({ name: 'start_waypoint_id' }),
    __metadata("design:type", RouteWaypointEntity_1.RouteWaypointEntity)
], ParcelEntity.prototype, "startWaypoint", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RouteWaypointEntity_1.RouteWaypointEntity),
    (0, typeorm_1.JoinColumn)({ name: 'end_waypoint_id' }),
    __metadata("design:type", RouteWaypointEntity_1.RouteWaypointEntity)
], ParcelEntity.prototype, "endWaypoint", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'weight_kg', type: 'decimal', precision: 5, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], ParcelEntity.prototype, "weightKg", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], ParcelEntity.prototype, "totalPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: ParcelStatus, default: ParcelStatus.RECEIVED }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_status', type: 'enum', enum: BookingEntity_1.PaymentStatus, default: BookingEntity_1.PaymentStatus.PENDING_CASH }),
    __metadata("design:type", String)
], ParcelEntity.prototype, "paymentStatus", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], ParcelEntity.prototype, "createdAt", void 0);
exports.ParcelEntity = ParcelEntity = __decorate([
    (0, typeorm_1.Entity)('parcels')
], ParcelEntity);
//# sourceMappingURL=ParcelEntity.js.map