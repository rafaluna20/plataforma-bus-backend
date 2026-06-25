import { CompanyEntity } from './CompanyEntity';
export declare enum VehicleType {
    BUS_1P = "BUS_1P",
    BUS_2P = "BUS_2P",
    MINIVAN = "MINIVAN",
    AUTO = "AUTO"
}
export declare enum ServiceMode {
    INTERPROVINCIAL = "INTERPROVINCIAL",
    LOCAL = "LOCAL"
}
export declare class VehicleEntity {
    id: string;
    company: CompanyEntity;
    plateNumber: string;
    vehicleType: VehicleType;
    serviceMode: ServiceMode;
    seatTemplate: any;
    capacity: number;
    imageUrl: string | null;
    isActive: boolean;
    createdAt: Date;
}
//# sourceMappingURL=VehicleEntity.d.ts.map