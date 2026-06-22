import { UserRole } from '../../infrastructure/database/entities/UserEntity';
export interface RegisterDTO {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
    companyId?: string;
    docType?: string;
    docNum?: string;
    phone?: string;
}
export interface LoginDTO {
    email: string;
    password: string;
}
export interface TokenPayload {
    sub: string;
    email: string;
    role: UserRole;
    companyId?: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        balance: number;
        companyId?: string;
    };
}
export declare class AuthService {
    private get userRepo();
    private get companyRepo();
    /** Registrar un nuevo usuario */
    register(data: RegisterDTO): Promise<AuthTokens>;
    /** Iniciar sesión */
    login(data: LoginDTO): Promise<AuthTokens>;
    /** Renovar access token usando refresh token */
    refreshTokens(refreshToken: string): Promise<AuthTokens>;
    /** Cerrar sesión (revocar refresh token) */
    logout(userId: string): Promise<void>;
    /** Obtener perfil del usuario autenticado */
    getProfile(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        balance: number;
        docType: string;
        docNum: string;
        phone: string;
        company: {
            id: string;
            name: string;
        };
        createdAt: Date;
    }>;
    /** Actualizar saldo del usuario (para billetera) */
    updateBalance(userId: string, delta: number): Promise<number>;
    private generateTokens;
}
//# sourceMappingURL=AuthService.d.ts.map