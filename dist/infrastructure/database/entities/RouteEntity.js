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
exports.RouteEntity = void 0;
const typeorm_1 = require("typeorm");
const CompanyEntity_1 = require("./CompanyEntity");
const VehicleEntity_1 = require("./VehicleEntity");
const RouteWaypointEntity_1 = require("./RouteWaypointEntity");
let RouteEntity = class RouteEntity {
};
exports.RouteEntity = RouteEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RouteEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => CompanyEntity_1.CompanyEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'company_id' }),
    __metadata("design:type", CompanyEntity_1.CompanyEntity)
], RouteEntity.prototype, "company", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], RouteEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: VehicleEntity_1.ServiceMode, name: 'service_mode' }),
    __metadata("design:type", String)
], RouteEntity.prototype, "serviceMode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], RouteEntity.prototype, "polyline", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], RouteEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => RouteWaypointEntity_1.RouteWaypointEntity, waypoint => waypoint.route),
    __metadata("design:type", Array)
], RouteEntity.prototype, "waypoints", void 0);
exports.RouteEntity = RouteEntity = __decorate([
    (0, typeorm_1.Entity)('routes')
], RouteEntity);
//# sourceMappingURL=RouteEntity.js.map