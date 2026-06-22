import { UserEntity, UserRole } from '../../infrastructure/database/entities/UserEntity';
export interface CreateAdminDTO {
    name: string;
    email: string;
    password: string;
    companyId: string;
    docType?: string;
    docNum?: string;
    phone?: string;
}
export interface UpdateUserRoleDTO {
    userId: string;
    role: UserRole;
    companyId?: string;
}
export interface PaginatedUsers {
    data: Omit<UserEntity, 'passwordHash' | 'refreshToken'>[];
    total: number;
    page: number;
    totalPages: number;
}
export declare class AdminService {
    private get userRepo();
    private get companyRepo();
    /**
     * Crear un usuario ADMIN directamente vinculado a una empresa.
     * Solo puede ser ejecutado por un SUPER_ADMIN.
     */
    createAdmin(data: CreateAdminDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>>;
    /**
     * Crear un usuario DRIVER vinculado a una empresa.
     */
    createDriver(data: CreateAdminDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>>;
    /**
     * Cambiar el rol de un usuario existente.
     * Permite promover PASSENGER → ADMIN/DRIVER o degradar roles.
     */
    updateUserRole(data: UpdateUserRoleDTO): Promise<Omit<UserEntity, 'passwordHash' | 'refreshToken'>>;
    /**
     * Activar o desactivar una cuenta de usuario.
     */
    toggleUserStatus(userId: string, isActive: boolean): Promise<{
        message: string;
    }>;
    /**
     * Listar todos los usuarios con paginación y filtros opcionales.
     */
    listUsers(options: {
        page?: number;
        limit?: number;
        role?: UserRole;
        companyId?: string;
        search?: string;
    }): Promise<PaginatedUsers>;
    /**
     * Obtener estadísticas del sistema (solo SUPER_ADMIN).
     */
    getSystemStats(): Promise<{
        totalUsers: number;
        byRole: Record<string, number>;
        totalCompanies: number;
        activeUsers: number;
    }>;
}
//# sourceMappingURL=AdminService.d.ts.map