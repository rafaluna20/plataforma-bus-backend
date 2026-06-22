"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const data_source_1 = require("../../infrastructure/database/data-source");
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const CompanyEntity_1 = require("../../infrastructure/database/entities/CompanyEntity");
const logger_1 = require("../../infrastructure/logger");
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'CHANGE_THIS_REFRESH_SECRET_IN_PRODUCTION';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;
class AuthService {
    get userRepo() {
        return data_source_1.AppDataSource.getRepository(UserEntity_1.UserEntity);
    }
    get companyRepo() {
        return data_source_1.AppDataSource.getRepository(CompanyEntity_1.CompanyEntity);
    }
    /** Registrar un nuevo usuario */
    async register(data) {
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
        const passwordHash = await bcryptjs_1.default.hash(data.password, SALT_ROUNDS);
        // Buscar empresa si se proporcionó
        let company = null;
        if (data.companyId) {
            company = await this.companyRepo.findOne({ where: { id: data.companyId } });
            if (!company)
                throw new Error('Empresa no encontrada');
        }
        const user = this.userRepo.create({
            name: data.name,
            email: data.email.toLowerCase(),
            passwordHash,
            role: data.role || UserEntity_1.UserRole.PASSENGER,
            company,
            docType: data.docType,
            docNum: data.docNum,
            phone: data.phone,
            balance: 0,
        });
        const savedUser = await this.userRepo.save(user);
        logger_1.logger.info(`Nuevo usuario registrado: ${savedUser.email} (${savedUser.role})`);
        return this.generateTokens(savedUser);
    }
    /** Iniciar sesión */
    async login(data) {
        const user = await this.userRepo.findOne({
            where: { email: data.email.toLowerCase() },
            relations: { company: true },
        });
        if (!user) {
            throw new Error('Credenciales inválidas');
        }
        if (!user.isActive) {
            throw new Error('Esta cuenta ha sido desactivada. Contacta al soporte.');
        }
        const passwordValid = await bcryptjs_1.default.compare(data.password, user.passwordHash);
        if (!passwordValid) {
            throw new Error('Credenciales inválidas');
        }
        logger_1.logger.info(`Login exitoso: ${user.email} (${user.role})`);
        return this.generateTokens(user);
    }
    /** Renovar access token usando refresh token */
    async refreshTokens(refreshToken) {
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(refreshToken, JWT_REFRESH_SECRET);
        }
        catch {
            throw new Error('Refresh token inválido o expirado');
        }
        // Reintentar la consulta hasta 3 veces si hay error de conexión
        let user = null;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                user = await this.userRepo.findOne({
                    where: { id: payload.sub },
                    relations: { company: true },
                });
                lastError = null;
                break; // Éxito — salir del loop
            }
            catch (err) {
                lastError = err;
                const isConnectionError = err.message?.includes('Connection terminated') ||
                    err.message?.includes('connection') ||
                    err.code === 'ECONNRESET';
                if (isConnectionError && attempt < 3) {
                    logger_1.logger.warn(`[Auth] Error de conexión BD en refreshTokens (intento ${attempt}/3). Reintentando...`);
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Backoff exponencial
                    continue;
                }
                throw err; // Si no es error de conexión o agotamos reintentos, lanzar
            }
        }
        if (lastError)
            throw lastError;
        if (!user || user.refreshToken !== refreshToken) {
            throw new Error('Refresh token revocado o inválido');
        }
        if (!user.isActive) {
            throw new Error('Cuenta desactivada');
        }
        return this.generateTokens(user);
    }
    /** Cerrar sesión (revocar refresh token) */
    async logout(userId) {
        await this.userRepo.update(userId, { refreshToken: null });
        logger_1.logger.info(`Logout: userId=${userId}`);
    }
    /** Obtener perfil del usuario autenticado */
    async getProfile(userId) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            relations: { company: true },
        });
        if (!user)
            throw new Error('Usuario no encontrado');
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
            createdAt: user.createdAt,
        };
    }
    /** Actualizar saldo del usuario (para billetera) */
    async updateBalance(userId, delta) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new Error('Usuario no encontrado');
        const newBalance = Math.max(0, Number(user.balance) + delta);
        await this.userRepo.update(userId, { balance: newBalance });
        return newBalance;
    }
    // ─── Privados ─────────────────────────────────────────────────────────────
    async generateTokens(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.company?.id,
        };
        const accessToken = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        const refreshToken = jsonwebtoken_1.default.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        // Guardar refresh token hasheado en BD
        await this.userRepo.update(user.id, { refreshToken });
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
            },
        };
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map