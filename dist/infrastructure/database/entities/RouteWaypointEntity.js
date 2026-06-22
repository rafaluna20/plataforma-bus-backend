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
exports.RouteWaypointEntity = void 0;
const typeorm_1 = require("typeorm");
const RouteEntity_1 = require("./RouteEntity");
const StationEntity_1 = require("./StationEntity");
let RouteWaypointEntity = class RouteWaypointEntity {
};
exports.RouteWaypointEntity = RouteWaypointEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RouteWaypointEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RouteEntity_1.RouteEntity, route => route.waypoints, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'route_id' }),
    __metadata("design:type", RouteEntity_1.RouteEntity)
], RouteWaypointEntity.prototype, "route", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => StationEntity_1.StationEntity),
    (0, typeorm_1.JoinColumn)({ name: 'station_id' }),
    __metadata("design:type", StationEntity_1.StationEntity)
], RouteWaypointEntity.prototype, "station", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'stop_order', type: 'int' }),
    __metadata("design:type", Number)
], RouteWaypointEntity.prototype, "stopOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'estimated_duration_mins', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], RouteWaypointEntity.prototype, "estimatedDurationMins", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'base_price', type: 'decimal', precision: 10, scale: 2, default: 0.00 }),
    __metadata("design:type", Number)
], RouteWaypointEntity.prototype, "basePrice", void 0);
exports.RouteWaypointEntity = RouteWaypointEntity = __decorate([
    (0, typeorm_1.Entity)('route_waypoints'),
    (0, typeorm_1.Unique)(['route', 'stopOrder'])
], RouteWaypointEntity);
//# sourceMappingURL=RouteWaypointEntity.js.map