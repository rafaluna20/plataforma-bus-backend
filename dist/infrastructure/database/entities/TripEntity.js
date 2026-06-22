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
exports.TripEntity = exports.TripStatus = void 0;
const typeorm_1 = require("typeorm");
const RouteEntity_1 = require("./RouteEntity");
const VehicleEntity_1 = require("./VehicleEntity");
var TripStatus;
(function (TripStatus) {
    TripStatus["SCHEDULED"] = "SCHEDULED";
    TripStatus["BOARDING"] = "BOARDING";
    TripStatus["IN_TRANSIT"] = "IN_TRANSIT";
    TripStatus["COMPLETED"] = "COMPLETED";
    TripStatus["CANCELLED"] = "CANCELLED";
})(TripStatus || (exports.TripStatus = TripStatus = {}));
let TripEntity = class TripEntity {
};
exports.TripEntity = TripEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TripEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RouteEntity_1.RouteEntity, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'route_id' }),
    __metadata("design:type", RouteEntity_1.RouteEntity)
], TripEntity.prototype, "route", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => VehicleEntity_1.VehicleEntity, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'vehicle_id' }),
    __metadata("design:type", VehicleEntity_1.VehicleEntity)
], TripEntity.prototype, "vehicle", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'departure_time', type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], TripEntity.prototype, "departureTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: TripStatus, default: TripStatus.SCHEDULED }),
    __metadata("design:type", String)
], TripEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'actual_location',
        type: 'geometry',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: true,
    }),
    __metadata("design:type", String)
], TripEntity.prototype, "actualLocation", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], TripEntity.prototype, "createdAt", void 0);
exports.TripEntity = TripEntity = __decorate([
    (0, typeorm_1.Entity)('trips')
], TripEntity);
//# sourceMappingURL=TripEntity.js.map