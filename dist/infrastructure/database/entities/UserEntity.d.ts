import { CompanyEntity } from './CompanyEntity';
export declare enum UserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    ADMIN = "ADMIN",// Administrador de empresa
    DRIVER = "DRIVER",// Conductor
    PASSENGER = "PASSENGER"
}
export declare class UserEntity {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    docType: string;
    docNum: string;
    phone: string;
    balance: number;
    company: CompanyEntity | null;
    isActive: boolean;
    refreshToken: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=UserEntity.d.ts.map