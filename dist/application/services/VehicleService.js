"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehicleService = void 0;
const data_source_1 = require("../../infrastructure/database/data-source");
const VehicleEntity_1 = require("../../infrastructure/database/entities/VehicleEntity");
const CompanyEntity_1 = require("../../infrastructure/database/entities/CompanyEntity");
// Plantillas de asientos predeterminadas por tipo de vehículo
const DEFAULT_SEAT_TEMPLATES = {
    [VehicleEntity_1.VehicleType.AUTO]: {
        floors: 1,
        rows: 2,
        seatsPerRow: 2,
        seats: [
            { id: 'A1', row: 1, col: 1, type: 'copilot', label: 'Copiloto' },
            { id: 'B1', row: 2, col: 1, type: 'window', label: 'Ventana Izq.' },
            { id: 'B2', row: 2, col: 2, type: 'window', label: 'Ventana Der.' },
            { id: 'C1', row: 3, col: 1, type: 'middle', label: 'Central' },
        ],
    },
    [VehicleEntity_1.VehicleType.MINIVAN]: {
        floors: 1,
        rows: 4,
        seatsPerRow: 3,
        seats: Array.from({ length: 12 }, (_, i) => ({
            id: `S${i + 1}`,
            row: Math.floor(i / 3) + 1,
            col: (i % 3) + 1,
            type: (i % 3 === 0) ? 'window' : (i % 3 === 2) ? 'window' : 'middle',
            label: `Asiento ${i + 1}`,
        })),
    },
    [VehicleEntity_1.VehicleType.BUS_1P]: {
        floors: 1,
        rows: 12,
        seatsPerRow: 4,
        seats: Array.from({ length: 48 }, (_, i) => ({
            id: `P1-${i + 1}`,
            row: Math.floor(i / 4) + 1,
            col: (i % 4) + 1,
            type: (i % 4 === 0 || i % 4 === 3) ? 'window' : 'aisle',
            label: `P1-${i + 1}`,
        })),
    },
    [VehicleEntity_1.VehicleType.BUS_2P]: {
        floors: 2,
        floor1: {
            rows: 10,
            seatsPerRow: 4,
            seats: Array.from({ length: 40 }, (_, i) => ({
                id: `P1-${i + 1}`,
                row: Math.floor(i / 4) + 1,
                col: (i % 4) + 1,
                type: (i % 4 === 0 || i % 4 === 3) ? 'window' : 'aisle',
                label: `Piso1-${i + 1}`,
            })),
        },
        floor2: {
            rows: 12,
            seatsPerRow: 4,
            seats: Array.from({ length: 48 }, (_, i) => ({
                id: `P2-${i + 1}`,
                row: Math.floor(i / 4) + 1,
                col: (i % 4) + 1,
                type: (i % 4 === 0 || i % 4 === 3) ? 'window' : 'aisle',
                label: `Piso2-${i + 1}`,
            })),
        },
    },
};
class VehicleService {
    get repo() {
        return data_source_1.AppDataSource.getRepository(VehicleEntity_1.VehicleEntity);
    }
    get companyRepo() {
        return data_source_1.AppDataSource.getRepository(CompanyEntity_1.CompanyEntity);
    }
    /** Registrar un vehículo nuevo en la flota de una empresa */
    async create(data) {
        // Validar que la empresa exista
        const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
        if (!company)
            throw new Error('Empresa no encontrada');
        // Validar placa única
        const plateExists = await this.repo.findOne({ where: { plateNumber: data.plateNumber } });
        if (plateExists)
            throw new Error(`La placa ${data.plateNumber} ya está registrada en el sistema`);
        // Si no se envía plantilla personalizada, usar la predeterminada según tipo
        const seatTemplate = data.seatTemplate || DEFAULT_SEAT_TEMPLATES[data.vehicleType];
        if (!seatTemplate)
            throw new Error('Se requiere una plantilla de asientos para este tipo de vehículo');
        const vehicle = this.repo.create({
            company,
            plateNumber: data.plateNumber.toUpperCase(),
            vehicleType: data.vehicleType,
            serviceMode: data.serviceMode,
            seatTemplate,
            capacity: data.capacity,
            imageUrl: data.imageUrl || null,
        });
        return this.repo.save(vehicle);
    }
    /** Listar vehículos de una empresa */
    async findByCompany(companyId) {
        return this.repo.find({
            where: { company: { id: companyId }, isActive: true },
            order: { plateNumber: 'ASC' },
        });
    }
    /** Obtener vehículo por ID (incluye plantilla de asientos) */
    async findById(id) {
        const vehicle = await this.repo.findOne({ where: { id }, relations: { company: true } });
        if (!vehicle)
            throw new Error('Vehículo no encontrado');
        return vehicle;
    }
    /** Actualizar configuración de vehículo (ej. cambiar plantilla de asientos de minivan) */
    async update(id, data) {
        const vehicle = await this.findById(id);
        Object.assign(vehicle, data);
        return this.repo.save(vehicle);
    }
    /** Obtener plantillas predeterminadas de asientos */
    getDefaultTemplates() {
        return DEFAULT_SEAT_TEMPLATES;
    }
}
exports.VehicleService = VehicleService;
//# sourceMappingURL=VehicleService.js.map