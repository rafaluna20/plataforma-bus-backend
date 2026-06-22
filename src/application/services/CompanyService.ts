import { AppDataSource } from '../../infrastructure/database/data-source';
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

export class CompanyService {
    private get repo() {
        return AppDataSource.getRepository(CompanyEntity);
    }

    /** Registrar una nueva empresa operadora en el marketplace */
    public async create(data: CreateCompanyDTO): Promise<CompanyEntity> {
        // Validar RUC único
        const exists = await this.repo.findOne({ where: { ruc: data.ruc } });
        if (exists) throw new Error(`Ya existe una empresa registrada con RUC ${data.ruc}`);

        // Validar formato de RUC peruano (11 dígitos)
        if (!/^\d{11}$/.test(data.ruc)) {
            throw new Error('El RUC debe tener exactamente 11 dígitos numéricos');
        }

        const company = this.repo.create({
            ruc: data.ruc,
            tradeName: data.tradeName,
            legalName: data.legalName,
            commissionRate: data.commissionRate ?? 5.00, // Comisión por defecto 5%
        });

        return this.repo.save(company);
    }

    /** Listar todas las empresas activas */
    public async findAll(): Promise<CompanyEntity[]> {
        return this.repo.find({
            where: { isActive: true },
            order: { tradeName: 'ASC' },
        });
    }

    /** Obtener empresa por ID */
    public async findById(id: string): Promise<CompanyEntity> {
        const company = await this.repo.findOne({ where: { id } });
        if (!company) throw new Error('Empresa no encontrada');
        return company;
    }

    /** Actualizar datos de empresa */
    public async update(id: string, data: UpdateCompanyDTO): Promise<CompanyEntity> {
        const company = await this.findById(id);
        Object.assign(company, data);
        return this.repo.save(company);
    }
}
