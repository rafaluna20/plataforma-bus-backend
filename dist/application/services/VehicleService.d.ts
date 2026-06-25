import { VehicleEntity, VehicleType, ServiceMode } from '../../infrastructure/database/entities/VehicleEntity';
export interface CreateVehicleDTO {
    companyId: string;
    plateNumber: string;
    vehicleType: VehicleType;
    serviceMode: ServiceMode;
    seatTemplate: any;
    capacity: number;
    imageUrl?: string;
}
export interface UpdateVehicleDTO {
    serviceMode?: ServiceMode;
    seatTemplate?: any;
    capacity?: number;
    isActive?: boolean;
    imageUrl?: string;
}
export declare class VehicleService {
    private get repo();
    private get companyRepo();
    /** Registrar un vehículo nuevo en la flota de una empresa */
    create(data: CreateVehicleDTO): Promise<VehicleEntity>;
    /** Listar vehículos de una empresa */
    findByCompany(companyId: string): Promise<VehicleEntity[]>;
    /** Obtener vehículo por ID (incluye plantilla de asientos) */
    findById(id: string): Promise<VehicleEntity>;
    /** Actualizar configuración de vehículo (ej. cambiar plantilla de asientos de minivan) */
    update(id: string, data: UpdateVehicleDTO): Promise<VehicleEntity>;
    /** Obtener plantillas predeterminadas de asientos */
    getDefaultTemplates(): Record<VehicleType, any>;
}
//# sourceMappingURL=VehicleService.d.ts.map