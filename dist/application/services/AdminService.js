"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_source_1 = require("../../infrastructure/database/data-source");
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const CompanyEntity_1 = require("../../infrastructure/database/entities/CompanyEntity");
const logger_1 = require("../../infrastructure/logger");
const SALT_ROUNDS = 12;
class AdminService {
    get userRepo() {
        return data_source_1.AppDataSource.getRepository(UserEntity_1.UserEntity);
    }
    get companyRepo() {
        return data_source_1.AppDataSource.getRepository(CompanyEntity_1.CompanyEntity);
    }
    /**
     * Crear un usuario ADMIN directamente vinculado a una empresa.
     * Solo puede ser ejecutado por un SUPER_ADMIN.
     */
    async createAdmin(data) {
        // Verificar email único
        const existing = await this.userRepo.findOne({ where: { email: data.email.toLowerCase() } });
        if (existing) {
            throw new Error('Ya existe una cuenta registrada con este correo electrónico');
        }
        // Validar contraseña mínima
        if (data.password.length < 8) {
            throw new Error('La contraseña debe tener al menos 8 caracteres');
        }
        // Verificar que la empresa existe
        const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
        if (!company) {
            throw new Error('Empresa no encontrada. Crea la empresa primero.');
        }
        const passwordHash = await bcryptjs_1.default.hash(data.password, SALT_ROUNDS);
        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: UserEntity_1.UserRole.ADMIN,
            company,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            balance: 0,
            isActive: true,
        });
        const saved = await this.userRepo.save(user);
        logger_1.logger.info(`[Admin] ADMIN creado: ${saved.email} → empresa: ${company.tradeName}`);
        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }
    /**
     * Crear un usuario DRIVER vinculado a una empresa.
     */
    async createDriver(data) {
        const existing = await this.userRepo.findOne({ where: { email: data.email.toLowerCase() } });
        if (existing) {
            throw new Error('Ya existe una cuenta registrada con este correo electrónico');
        }
        const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
        if (!company) {
            throw new Error('Empresa no encontrada');
        }
        const passwordHash = await bcryptjs_1.default.hash(data.password, SALT_ROUNDS);
        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: UserEntity_1.UserRole.DRIVER,
            company,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            balance: 0,
            isActive: true,
        });
        const saved = await this.userRepo.save(user);
        logger_1.logger.info(`[Admin] DRIVER creado: ${saved.email} → empresa: ${company.tradeName}`);
        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }
    /**
     * Cambiar el rol de un usuario existente.
     * Permite promover PASSENGER → ADMIN/DRIVER o degradar roles.
     */
    async updateUserRole(data) {
        const user = await this.userRepo.findOne({
            where: { id: data.userId },
            relations: { company: true },
        });
        if (!user)
            throw new Error('Usuario no encontrado');
        // No permitir cambiar el rol de otro SUPER_ADMIN
        if (user.role === UserEntity_1.UserRole.SUPER_ADMIN) {
            throw new Error('No se puede modificar el rol de un SUPER_ADMIN');
        }
        user.role = data.role;
        // Si se asigna empresa, vincularla
        if (data.companyId) {
            const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company)
                throw new Error('Empresa no encontrada');
            user.company = company;
        }
        const saved = await this.userRepo.save(user);
        logger_1.logger.info(`[Admin] Rol actualizado: ${saved.email} → ${data.role}`);
        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }
    /**
     * Activar o desactivar una cuenta de usuario.
     */
    async toggleUserStatus(userId, isActive) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new Error('Usuario no encontrado');
        if (user.role === UserEntity_1.UserRole.SUPER_ADMIN) {
            throw new Error('No se puede desactivar una cuenta SUPER_ADMIN');
        }
        user.isActive = isActive;
        await this.userRepo.save(user);
        const action = isActive ? 'activada' : 'desactivada';
        logger_1.logger.info(`[Admin] Cuenta ${action}: ${user.email}`);
        return { message: `Cuenta ${action} exitosamente` };
    }
    /**
     * Listar todos los usuarios con paginación y filtros opcionales.
     */
    async listUsers(options) {
        const page = options.page || 1;
        const limit = Math.min(options.limit || 20, 100);
        const skip = (page - 1) * limit;
        const qb = this.userRepo
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.company', 'company')
            .select([
            'user.id', 'user.name', 'user.email', 'user.role',
            'user.docType', 'user.docNum', 'user.phone',
            'user.balance', 'user.isActive', 'user.createdAt',
            'company.id', 'company.tradeName',
        ])
            .orderBy('user.createdAt', 'DESC')
            .skip(skip)
            .take(limit);
        if (options.role) {
            qb.andWhere('user.role = :role', { role: options.role });
        }
        if (options.companyId) {
            qb.andWhere('company.id = :companyId', { companyId: options.companyId });
        }
        if (options.search) {
            qb.andWhere('(LOWER(user.name) LIKE :search OR LOWER(user.email) LIKE :search)', { search: `%${options.search.toLowerCase()}%` });
        }
        const [data, total] = await qb.getManyAndCount();
        return {
            data: data,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    /**
     * Obtener estadísticas del sistema (solo SUPER_ADMIN).
     */
    async getSystemStats() {
        const [totalUsers, activeUsers, totalCompanies] = await Promise.all([
            this.userRepo.count(),
            this.userRepo.count({ where: { isActive: true } }),
            this.companyRepo.count({ where: { isActive: true } }),
        ]);
        const roleCounts = await this.userRepo
            .createQueryBuilder('user')
            .select('user.role', 'role')
            .addSelect('COUNT(*)', 'count')
            .groupBy('user.role')
            .getRawMany();
        const byRole = {};
        roleCounts.forEach((r) => {
            byRole[r.role] = parseInt(r.count, 10);
        });
        return { totalUsers, byRole, totalCompanies, activeUsers };
    }
}
exports.AdminService = AdminService;
//# sourceMappingURL=AdminService.js.map