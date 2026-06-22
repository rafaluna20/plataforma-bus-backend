"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyService = void 0;
const data_source_1 = require("../../infrastructure/database/data-source");
const CompanyEntity_1 = require("../../infrastructure/database/entities/CompanyEntity");
class CompanyService {
    get repo() {
        return data_source_1.AppDataSource.getRepository(CompanyEntity_1.CompanyEntity);
    }
    /** Registrar una nueva empresa operadora en el marketplace */
    async create(data) {
        // Validar RUC único
        const exists = await this.repo.findOne({ where: { ruc: data.ruc } });
        if (exists)
            throw new Error(`Ya existe una empresa registrada con RUC ${data.ruc}`);
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
    async findAll() {
        return this.repo.find({
            where: { isActive: true },
            order: { tradeName: 'ASC' },
        });
    }
    /** Obtener empresa por ID */
    async findById(id) {
        const company = await this.repo.findOne({ where: { id } });
        if (!company)
            throw new Error('Empresa no encontrada');
        return company;
    }
    /** Actualizar datos de empresa */
    async update(id, data) {
        const company = await this.findById(id);
        Object.assign(company, data);
        return this.repo.save(company);
    }
}
exports.CompanyService = CompanyService;
//# sourceMappingURL=CompanyService.js.map