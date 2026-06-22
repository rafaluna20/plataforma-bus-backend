/**
 * Tests unitarios para AuthService
 * 
 * Ejecutar: npm test
 * Cobertura: npm run test:coverage
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock de TypeORM AppDataSource
const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
};

const mockCompanyRepo = {
    findOne: jest.fn(),
};

jest.mock('../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'UserEntity') return mockUserRepo;
            if (name === 'CompanyEntity') return mockCompanyRepo;
            return {};
        }),
    },
}));

jest.mock('../infrastructure/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

// ─── Importar después de los mocks ───────────────────────────────────────────

import { AuthService } from '../application/services/AuthService';
import { UserRole } from '../infrastructure/database/entities/UserEntity';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
    let authService: AuthService;

    beforeEach(() => {
        authService = new AuthService();
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
        process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing';
    });

    // ─── register ─────────────────────────────────────────────────────────────

    describe('register()', () => {
        it('debe crear un usuario nuevo y retornar tokens', async () => {
            mockUserRepo.findOne.mockResolvedValue(null); // Email no existe
            mockCompanyRepo.findOne.mockResolvedValue(null);

            const mockUser = {
                id: 'uuid-123',
                name: 'Juan Pérez',
                email: 'juan@test.com',
                role: UserRole.PASSENGER,
                balance: 0,
                isActive: true,
                refreshToken: null,
                company: null,
            };

            mockUserRepo.create.mockReturnValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            const result = await authService.register({
                name: 'Juan Pérez',
                email: 'juan@test.com',
                password: 'Password123!',
            });

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result).toHaveProperty('user');
            expect(result.user.email).toBe('juan@test.com');
            expect(result.user.role).toBe(UserRole.PASSENGER);
            expect(mockUserRepo.save).toHaveBeenCalledTimes(2); // create + save refresh token
        });

        it('debe lanzar error si el email ya está registrado', async () => {
            mockUserRepo.findOne.mockResolvedValue({ id: 'existing-uuid', email: 'juan@test.com' });

            await expect(
                authService.register({
                    name: 'Juan',
                    email: 'juan@test.com',
                    password: 'Password123!',
                })
            ).rejects.toThrow('Ya existe una cuenta registrada con este correo electrónico');
        });

        it('debe lanzar error si la contraseña tiene menos de 8 caracteres', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(
                authService.register({
                    name: 'Juan',
                    email: 'juan@test.com',
                    password: '123',
                })
            ).rejects.toThrow('La contraseña debe tener al menos 8 caracteres');
        });

        it('debe normalizar el email a minúsculas', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            const mockUser = {
                id: 'uuid-123',
                name: 'Juan',
                email: 'juan@test.com',
                role: UserRole.PASSENGER,
                balance: 0,
                isActive: true,
                refreshToken: null,
                company: null,
            };

            mockUserRepo.create.mockReturnValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            await authService.register({
                name: 'Juan',
                email: 'JUAN@TEST.COM',
                password: 'Password123!',
            });

            expect(mockUserRepo.findOne).toHaveBeenCalledWith({
                where: { email: 'juan@test.com' },
            });
        });
    });

    // ─── login ────────────────────────────────────────────────────────────────

    describe('login()', () => {
        it('debe retornar tokens con credenciales válidas', async () => {
            const passwordHash = await bcrypt.hash('Password123!', 12);
            const mockUser = {
                id: 'uuid-123',
                name: 'Juan',
                email: 'juan@test.com',
                passwordHash,
                role: UserRole.PASSENGER,
                balance: 100,
                isActive: true,
                refreshToken: null,
                company: null,
            };

            mockUserRepo.findOne.mockResolvedValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            const result = await authService.login({
                email: 'juan@test.com',
                password: 'Password123!',
            });

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user.email).toBe('juan@test.com');
        });

        it('debe lanzar error con credenciales inválidas', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(
                authService.login({ email: 'noexiste@test.com', password: 'cualquier' })
            ).rejects.toThrow('Credenciales inválidas');
        });

        it('debe lanzar error si la contraseña es incorrecta', async () => {
            const passwordHash = await bcrypt.hash('CorrectPassword!', 12);
            mockUserRepo.findOne.mockResolvedValue({
                id: 'uuid-123',
                email: 'juan@test.com',
                passwordHash,
                isActive: true,
                company: null,
            });

            await expect(
                authService.login({ email: 'juan@test.com', password: 'WrongPassword!' })
            ).rejects.toThrow('Credenciales inválidas');
        });

        it('debe lanzar error si la cuenta está desactivada', async () => {
            const passwordHash = await bcrypt.hash('Password123!', 12);
            mockUserRepo.findOne.mockResolvedValue({
                id: 'uuid-123',
                email: 'juan@test.com',
                passwordHash,
                isActive: false,
                company: null,
            });

            await expect(
                authService.login({ email: 'juan@test.com', password: 'Password123!' })
            ).rejects.toThrow('desactivada');
        });
    });

    // ─── generateTokens (indirectamente) ─────────────────────────────────────

    describe('tokens JWT', () => {
        it('el access token debe expirar en 15 minutos', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            const mockUser = {
                id: 'uuid-123',
                name: 'Juan',
                email: 'juan@test.com',
                role: UserRole.PASSENGER,
                balance: 0,
                isActive: true,
                refreshToken: null,
                company: null,
            };

            mockUserRepo.create.mockReturnValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            const result = await authService.register({
                name: 'Juan',
                email: 'juan@test.com',
                password: 'Password123!',
            });

            const decoded = jwt.decode(result.accessToken) as any;
            const expiresIn = decoded.exp - decoded.iat;

            // 15 minutos = 900 segundos (con margen de ±5s)
            expect(expiresIn).toBeGreaterThanOrEqual(895);
            expect(expiresIn).toBeLessThanOrEqual(905);
        });

        it('el access token debe contener el rol del usuario', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            const mockUser = {
                id: 'uuid-123',
                name: 'Juan',
                email: 'juan@test.com',
                role: UserRole.PASSENGER,
                balance: 0,
                isActive: true,
                refreshToken: null,
                company: null,
            };

            mockUserRepo.create.mockReturnValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            const result = await authService.register({
                name: 'Juan',
                email: 'juan@test.com',
                password: 'Password123!',
            });

            const decoded = jwt.decode(result.accessToken) as any;
            expect(decoded.role).toBe(UserRole.PASSENGER);
            expect(decoded.email).toBe('juan@test.com');
        });
    });
});
