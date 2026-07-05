import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { AppDataSource } from '../../infrastructure/database/data-source';
import { UserEntity, UserRole } from '../../infrastructure/database/entities/UserEntity';
import { CompanyEntity } from '../../infrastructure/database/entities/CompanyEntity';
import { logger } from '../../infrastructure/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'CHANGE_THIS_REFRESH_SECRET_IN_PRODUCTION';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;

// El refresh token es un JWT largo y ya de por sí de alta entropía: no necesita
// un hash lento con sal (bcrypt además trunca en 72 bytes, lo que rompería la
// comparación). Un digest sha256 basta para que una fuga de BD no entregue
// sesiones válidas directamente.
const hashRefreshToken = (token: string): string => createHash('sha256').update(token).digest('hex');

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
    sub: string;       // userId
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
        station?: { id: string; name: string; city: string } | null;
    };
}

export class AuthService {
    private get userRepo() {
        return AppDataSource.getRepository(UserEntity);
    }

    private get companyRepo() {
        return AppDataSource.getRepository(CompanyEntity);
    }

    /** Registrar un nuevo usuario */
    public async register(data: RegisterDTO): Promise<AuthTokens> {
        // Verificar email único
        const existing = await this.userRepo.findOne({ where: { email: data.email.toLowerCase() } });
        if (existing) {
            throw new Error('Ya existe una cuenta registrada con este correo electrónico');
        }

        // Validar contraseña mínima
        if (data.password.length < 8) {
            throw new Error('La contraseña debe tener al menos 8 caracteres');
        }

        // Hash de contraseña
        const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

        // Buscar empresa si se proporcionó
        let company: CompanyEntity | null = null;
        if (data.companyId) {
            company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company) throw new Error('Empresa no encontrada');
        }

        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: data.role || UserRole.PASSENGER,
            company,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            balance: 0,
        });

        const savedUser = await this.userRepo.save(user);
        logger.info(`Nuevo usuario registrado: ${savedUser.email} (${savedUser.role})`);

        return this.generateTokens(savedUser);
    }

    /** Iniciar sesión */
    public async login(data: LoginDTO): Promise<AuthTokens> {
        const user = await this.userRepo.findOne({
            where: { email: data.email.toLowerCase() },
            relations: { company: true, station: true },
        });

        if (!user) {
            throw new Error('Credenciales inválidas');
        }

        if (!user.isActive) {
            throw new Error('Esta cuenta ha sido desactivada. Contacta al soporte.');
        }

        const passwordValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!passwordValid) {
            throw new Error('Credenciales inválidas');
        }

        logger.info(`Login exitoso: ${user.email} (${user.role})`);
        return this.generateTokens(user);
    }

    /** Renovar access token usando refresh token */
    public async refreshTokens(refreshToken: string): Promise<AuthTokens> {
        let payload: TokenPayload;
        try {
            payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as TokenPayload;
        } catch {
            throw new Error('Refresh token inválido o expirado');
        }

        // Reintentar la consulta hasta 3 veces si hay error de conexión
        let user = null;
        let lastError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                user = await this.userRepo.findOne({
                    where: { id: payload.sub },
                    relations: { company: true, station: true },
                });
                lastError = null;
                break; // Éxito — salir del loop
            } catch (err: any) {
                lastError = err;
                const isConnectionError = err.message?.includes('Connection terminated') ||
                    err.message?.includes('connection') ||
                    err.code === 'ECONNRESET';

                if (isConnectionError && attempt < 3) {
                    logger.warn(`[Auth] Error de conexión BD en refreshTokens (intento ${attempt}/3). Reintentando...`);
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Backoff exponencial
                    continue;
                }
                throw err; // Si no es error de conexión o agotamos reintentos, lanzar
            }
        }

        if (lastError) throw lastError;

        if (!user || user.refreshToken !== hashRefreshToken(refreshToken)) {
            throw new Error('Refresh token revocado o inválido');
        }

        if (!user.isActive) {
            throw new Error('Cuenta desactivada');
        }

        return this.generateTokens(user);
    }

    /** Cerrar sesión (revocar refresh token) */
    public async logout(userId: string): Promise<void> {
        await this.userRepo.update(userId, { refreshToken: null });
        logger.info(`Logout: userId=${userId}`);
    }

    /** Obtener perfil del usuario autenticado */
    public async getProfile(userId: string) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            relations: { company: true, station: true },
        });
        if (!user) throw new Error('Usuario no encontrado');

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            balance: Number(user.balance),
            docType: user.docType,
            docNum: user.docNum,
            phone: user.phone,
            company: user.company ? { id: user.company.id, name: user.company.tradeName } : null,
            station: user.station ? { id: user.station.id, name: user.station.name, city: user.station.city } : null,
            createdAt: user.createdAt,
        };
    }

    /** Actualizar saldo del usuario (para billetera) */
    public async updateBalance(userId: string, delta: number): Promise<number> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new Error('Usuario no encontrado');

        const newBalance = Math.max(0, Number(user.balance) + delta);
        await this.userRepo.update(userId, { balance: newBalance });
        return newBalance;
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private async generateTokens(user: UserEntity): Promise<AuthTokens> {
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.company?.id,
        };

        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
        const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);

        // Guardar refresh token hasheado en BD (nunca el token crudo)
        await this.userRepo.update(user.id, { refreshToken: hashRefreshToken(refreshToken) });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                balance: Number(user.balance),
                companyId: user.company?.id,
                station: user.station ? { id: user.station.id, name: user.station.name, city: user.station.city } : null,
            },
        };
    }
}
