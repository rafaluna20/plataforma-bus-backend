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
exports.VehicleEntity = exports.ServiceMode = exports.VehicleType = void 0;
const typeorm_1 = require("typeorm");
const CompanyEntity_1 = require("./CompanyEntity");
var VehicleType;
(function (VehicleType) {
    VehicleType["BUS_1P"] = "BUS_1P";
    VehicleType["BUS_2P"] = "BUS_2P";
    VehicleType["MINIVAN"] = "MINIVAN";
    VehicleType["AUTO"] = "AUTO";
})(VehicleType || (exports.VehicleType = VehicleType = {}));
var ServiceMode;
(function (ServiceMode) {
    ServiceMode["INTERPROVINCIAL"] = "INTERPROVINCIAL";
    ServiceMode["LOCAL"] = "LOCAL";
})(ServiceMode || (exports.ServiceMode = ServiceMode = {}));
let VehicleEntity = class VehicleEntity {
};
exports.VehicleEntity = VehicleEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], VehicleEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => CompanyEntity_1.CompanyEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'company_id' }),
    __metadata("design:type", CompanyEntity_1.CompanyEntity)
], VehicleEntity.prototype, "company", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'plate_number', type: 'varchar', length: 10, unique: true }),
    __metadata("design:type", String)
], VehicleEntity.prototype, "plateNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: VehicleType, name: 'v_type' }),
    __metadata("design:type", String)
], VehicleEntity.prototype, "vehicleType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: ServiceMode, name: 'service_mode' }),
    __metadata("design:type", String)
], VehicleEntity.prototype, "serviceMode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'seat_template', type: 'jsonb' }),
    __metadata("design:type", Object)
], VehicleEntity.prototype, "seatTemplate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], VehicleEntity.prototype, "capacity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'image_url', type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", String)
], VehicleEntity.prototype, "imageUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], VehicleEntity.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], VehicleEntity.prototype, "createdAt", void 0);
exports.VehicleEntity = VehicleEntity = __decorate([
    (0, typeorm_1.Entity)('vehicles')
], VehicleEntity);
//# sourceMappingURL=VehicleEntity.js.map