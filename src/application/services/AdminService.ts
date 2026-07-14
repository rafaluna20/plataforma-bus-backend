import bcrypt from 'bcryptjs';
import { AppDataSource } from '../../infrastructure/database/data-source';
import { UserEntity, UserRole } from '../../infrastructure/database/entities/UserEntity';
import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
import { logger } from '../../infrastructure/logger';
import { StationEntity } from '../../infrastructure/database/entities/StationEntity';

const SALT_ROUNDS = 12;

export interface CreateAdminDTO {
    name: string;
    email: string;
    password: string;
    companyId: string;
    docType?: string;
    docNum?: string;
    phone?: string;
    stationId?: string; // Solo para vendedores
    licenseNumber?: string; // Solo relevante para conductores (Manifiesto de Pasajeros)
}

export interface UpdateUserRoleDTO {
    userId: string;
    role: UserRole;
    companyId?: string;
    actorRole?: UserRole;
    actorCompanyId?: string;
}

export interface PaginatedUsers {
    data: Omit<UserEntity, 'passwordHash' | 'refreshToken'>[];
    total: number;
    page: number;
    totalPages: number;
}

export class AdminService {
    private get userRepo() {
        return AppDataSource.getRepository(UserEntity);
    }

    private get companyRepo() {
        return AppDataSource.getRepository(CompanyEntity);
    }

    private get stationRepo() {
        return AppDataSource.getRepository(StationEntity);
    }

    /**
     * Crear un usuario ADMIN directamente vinculado a una empresa.
     * Solo puede ser ejecutado por un SUPER_ADMIN.
     */
    public async createAdmin(data: CreateAdminDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>> {
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

        const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: UserRole.ADMIN,
            company,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            balance: 0,
            isActive: true,
        });

        const saved = await this.userRepo.save(user);
        logger.info(`[Admin] ADMIN creado: ${saved.email} → empresa: ${company.tradeName}`);

        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }

    /**
     * Crear un usuario DRIVER vinculado a una empresa.
     */
    public async createDriver(data: CreateAdminDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>> {
        const existing = await this.userRepo.findOne({ where: { email: data.email.toLowerCase() } });
        if (existing) {
            throw new Error('Ya existe una cuenta registrada con este correo electrónico');
        }

        const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
        if (!company) {
            throw new Error('Empresa no encontrada');
        }

        const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: UserRole.DRIVER,
            company,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            licenseNumber: data.licenseNumber || null,
            balance: 0,
            isActive: true,
        });

        const saved = await this.userRepo.save(user);
        logger.info(`[Admin] DRIVER creado: ${saved.email} → empresa: ${company.tradeName}`);

        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }

    /**
     * Crear un usuario AGENCY_SELLER vinculado a una empresa y opcionalmente a un paradero (estación).
     */
    public async createSeller(data: CreateAdminDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>> {
        const existing = await this.userRepo.findOne({ where: { email: data.email.toLowerCase() } });
        if (existing) {
            throw new Error('Ya existe una cuenta registrada con este correo electrónico');
        }

        const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
        if (!company) {
            throw new Error('Empresa no encontrada');
        }

        let station = null;
        if (data.stationId) {
            station = await this.stationRepo.findOne({ where: { id: data.stationId, company: { id: company.id } } });
            if (!station) {
                throw new Error('Paradero/Estación no encontrada o no pertenece a la empresa');
            }
        }

        const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: UserRole.AGENCY_SELLER,
            company,
            station,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            balance: 0,
            isActive: true,
        });

        const saved = await this.userRepo.save(user);
        logger.info(`[Admin] SELLER creado: ${saved.email} → empresa: ${company.tradeName} (Estación: ${station?.name || 'N/A'})`);

        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }

    /**
     * Cambiar el rol de un usuario existente.
     * Permite promover PASSENGER → ADMIN/DRIVER o degradar roles.
     *
     * SEGURIDAD: solo SUPER_ADMIN puede asignar los roles ADMIN o SUPER_ADMIN
     * (de lo contrario un ADMIN podría auto-promoverse a SUPER_ADMIN); un
     * ADMIN solo puede gestionar usuarios de su propia empresa.
     */
    public async updateUserRole(data: UpdateUserRoleDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>> {
        const user = await this.userRepo.findOne({
            where: { id: data.userId },
            relations: { company: true },
        });

        if (!user) throw new Error('Usuario no encontrado');

        // No permitir cambiar el rol de otro SUPER_ADMIN
        if (user.role === UserRole.SUPER_ADMIN) {
            throw new Error('No se puede modificar el rol de un SUPER_ADMIN');
        }

        if (data.actorRole !== UserRole.SUPER_ADMIN) {
            if (data.role === UserRole.ADMIN || data.role === UserRole.SUPER_ADMIN) {
                throw new Error('Solo un SUPER_ADMIN puede asignar el rol ADMIN o SUPER_ADMIN');
            }

            const targetCompanyId = data.companyId ?? user.company?.id;
            if (!data.actorCompanyId || targetCompanyId !== data.actorCompanyId) {
                throw new Error('Solo puedes gestionar usuarios de tu propia empresa');
            }
        }

        user.role = data.role;

        // Si se asigna empresa, vincularla
        if (data.companyId) {
            const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company) throw new Error('Empresa no encontrada');
            user.company = company;
        }

        const saved = await this.userRepo.save(user);
        logger.info(`[Admin] Rol actualizado: ${saved.email} → ${data.role}`);

        const { passwordHash: _, refreshToken: __, ...safeUser } = saved;
        return safeUser;
    }

    /**
     * Activar o desactivar una cuenta de usuario.
     *
     * SEGURIDAD: un ADMIN solo puede activar/desactivar staff (DRIVER,
     * AGENCY_SELLER, PASSENGER) de SU PROPIA empresa — no a otro ADMIN, y no a
     * usuarios de otra empresa. SUPER_ADMIN no tiene esa restricción (salvo
     * nunca poder tocar a otro SUPER_ADMIN, ya validado abajo).
     */
    public async toggleUserStatus(
        userId: string,
        isActive: boolean,
        actorRole?: UserRole,
        actorCompanyId?: string,
    ): Promise<{ message: string }> {
        const user = await this.userRepo.findOne({ where: { id: userId }, relations: { company: true } });
        if (!user) throw new Error('Usuario no encontrado');

        if (user.role === UserRole.SUPER_ADMIN) {
            throw new Error('No se puede desactivar una cuenta SUPER_ADMIN');
        }

        if (actorRole !== UserRole.SUPER_ADMIN) {
            if (user.role === UserRole.ADMIN) {
                throw new Error('No tienes permisos para modificar la cuenta de otro ADMIN');
            }
            if (!actorCompanyId || user.company?.id !== actorCompanyId) {
                throw new Error('Solo puedes gestionar usuarios de tu propia empresa');
            }
        }

        user.isActive = isActive;
        await this.userRepo.save(user);

        const action = isActive ? 'activada' : 'desactivada';
        logger.info(`[Admin] Cuenta ${action}: ${user.email}`);
        return { message: `Cuenta ${action} exitosamente` };
    }

    /**
     * Listar todos los usuarios con paginación y filtros opcionales.
     */
    public async listUsers(options: {
        page?: number;
        limit?: number;
        role?: UserRole;
        companyId?: string;
        search?: string;
    }): Promise<PaginatedUsers> {
        const page = options.page || 1;
        const limit = Math.min(options.limit || 20, 100);
        const skip = (page - 1) * limit;

        const qb = this.userRepo
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.company', 'company')
            .leftJoinAndSelect('user.station', 'station')
            .select([
                'user.id', 'user.name', 'user.email', 'user.role',
                'user.docType', 'user.docNum', 'user.phone',
                'user.balance', 'user.isActive', 'user.createdAt',
                'company.id', 'company.tradeName',
                'station.id', 'station.name', 'station.city',
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
            qb.andWhere(
                '(LOWER(user.name) LIKE :search OR LOWER(user.email) LIKE :search)',
                { search: `%${options.search.toLowerCase()}%` }
            );
        }

        const [data, total] = await qb.getManyAndCount();

        return {
            data: data as any,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Obtener estadísticas del sistema (solo SUPER_ADMIN).
     */
    public async getSystemStats(): Promise<{
        totalUsers: number;
        byRole: Record<string, number>;
        totalCompanies: number;
        activeUsers: number;
    }> {
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

        const byRole: Record<string, number> = {};
        roleCounts.forEach((r) => {
            byRole[r.role] = parseInt(r.count, 10);
        });

        return { totalUsers, byRole, totalCompanies, activeUsers };
    }
}
