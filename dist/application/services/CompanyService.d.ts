import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
export interface CreateCompanyDTO {
    ruc: string;
    tradeName: string;
    legalName: string;
    commissionRate?: number;
}
export interface UpdateCompanyDTO {
    tradeName?: string;
    legalName?: string;
    commissionRate?: number;
    isActive?: boolean;
}
export declare class CompanyService {
    private get repo();
    /** Registrar una nueva empresa operadora en el marketplace */
    create(data: CreateCompanyDTO): Promise<CompanyEntity>;
    /** Listar todas las empresas activas */
    findAll(): Promise<CompanyEntity[]>;
    /** Obtener empresa por ID */
    findById(id: string): Promise<CompanyEntity>;
    /** Actualizar datos de empresa */
    update(id: string, data: UpdateCompanyDTO): Promise<CompanyEntity>;
}
//# sourceMappingURL=CompanyService.d.ts.map