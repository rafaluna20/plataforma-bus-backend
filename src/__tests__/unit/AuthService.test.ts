/**
 * Tests unitarios para AuthService
 * Usa mocks de TypeORM para no requerir BD real
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock del AppDataSource antes de importar AuthService
const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
};

const mockCompanyRepo = {
    findOne: jest.fn(),
};

jest.mock('../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'UserEntity') return mockUserRepo;
            if (name === 'CompanyEntity') return mockCompanyRepo;
            return mockUserRepo;
        }),
    },
}));

jest.mock('../../infrastructure/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

// Importar después de los mocks. JWT_SECRET y demás ya están seteados en
// process.env desde jest.setup.js (setupFiles), que corre antes que este
// import — asignarlos aquí no serviría, ya que los `import` se hoistean por
// encima de cualquier otro código del archivo y AuthService ya habría
// capturado el valor anterior en su constante de módulo.
import { AuthService } from '../../application/services/AuthService';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';

describe('AuthService', () => {
    let authService: AuthService;

    beforeEach(() => {
        authService = new AuthService();
        jest.clearAllMocks();
    });

    // ─── register ─────────────────────────────────────────────────────────────

    describe('register()', () => {
        it('debe registrar un nuevo usuario correctamente', async () => {
            mockUserRepo.findOne.mockResolvedValue(null); // Email no existe
            mockUserRepo.create.mockReturnValue({
                id: 'user-uuid-123',
                name: 'Juan Pérez',
                email: 'juan@test.com',
                role: UserRole.PASSENGER,
                balance: 0,
                company: null,
            });
            mockUserRepo.save.mockResolvedValue({
                id: 'user-uuid-123',
                name: 'Juan Pérez',
                email: 'juan@test.com',
                role: UserRole.PASSENGER,
                balance: 0,
                company: null,
            });
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            const result = await authService.register({
                name: 'Juan Pérez',
                email: 'juan@test.com',
                password: 'SecurePass123',
            });

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user.email).toBe('juan@test.com');
            expect(result.user.role).toBe(UserRole.PASSENGER);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({
                where: { email: 'juan@test.com' },
            });
        });

        it('debe lanzar error si el email ya existe', async () => {
            mockUserRepo.findOne.mockResolvedValue({ id: 'existing-user', email: 'juan@test.com' });

            await expect(
                authService.register({
                    name: 'Juan Pérez',
                    email: 'juan@test.com',
                    password: 'SecurePass123',
                })
            ).rejects.toThrow('Ya existe una cuenta registrada con este correo electrónico');
        });

        it('debe lanzar error si la contraseña tiene menos de 8 caracteres', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(
                authService.register({
                    name: 'Juan Pérez',
                    email: 'juan@test.com',
                    password: '1234567', // 7 caracteres
                })
            ).rejects.toThrow('La contraseña debe tener al menos 8 caracteres');
        });

        it('debe normalizar el email a minúsculas', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            mockUserRepo.create.mockReturnValue({ id: 'u1', email: 'juan@test.com', role: UserRole.PASSENGER, balance: 0, company: null });
            mockUserRepo.save.mockResolvedValue({ id: 'u1', email: 'juan@test.com', role: UserRole.PASSENGER, balance: 0, company: null });
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            await authService.register({
                name: 'Juan',
                email: 'JUAN@TEST.COM',
                password: 'SecurePass123',
            });

            expect(mockUserRepo.findOne).toHaveBeenCalledWith({
                where: { email: 'juan@test.com' },
            });
        });
    });

    // ─── login ────────────────────────────────────────────────────────────────

    describe('login()', () => {
        const hashedPassword = bcrypt.hashSync('SecurePass123', 10);

        const mockUser = {
            id: 'user-uuid-123',
            name: 'Juan Pérez',
            email: 'juan@test.com',
            passwordHash: hashedPassword,
            role: UserRole.PASSENGER,
            balance: 100,
            isActive: true,
            company: null,
            refreshToken: null,
        };

        it('debe iniciar sesión con credenciales correctas', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            const result = await authService.login({
                email: 'juan@test.com',
                password: 'SecurePass123',
            });

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user.id).toBe('user-uuid-123');
        });

        it('debe lanzar error con credenciales incorrectas (usuario no existe)', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(
                authService.login({ email: 'noexiste@test.com', password: 'cualquier' })
            ).rejects.toThrow('Credenciales inválidas');
        });

        it('debe lanzar error con contraseña incorrecta', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);

            await expect(
                authService.login({ email: 'juan@test.com', password: 'WrongPassword' })
            ).rejects.toThrow('Credenciales inválidas');
        });

        it('debe lanzar error si la cuenta está desactivada', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false });

            await expect(
                authService.login({ email: 'juan@test.com', password: 'SecurePass123' })
            ).rejects.toThrow('Esta cuenta ha sido desactivada');
        });

        it('el access token debe contener el payload correcto', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            const result = await authService.login({
                email: 'juan@test.com',
                password: 'SecurePass123',
            });

            const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET!) as any;
            expect(decoded.sub).toBe('user-uuid-123');
            expect(decoded.email).toBe('juan@test.com');
            expect(decoded.role).toBe(UserRole.PASSENGER);
        });
    });

    // ─── logout ───────────────────────────────────────────────────────────────

    describe('logout()', () => {
        it('debe revocar el refresh token del usuario', async () => {
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            await authService.logout('user-uuid-123');

            expect(mockUserRepo.update).toHaveBeenCalledWith('user-uuid-123', { refreshToken: null });
        });
    });

    // ─── updateBalance ────────────────────────────────────────────────────────

    describe('updateBalance()', () => {
        it('debe incrementar el saldo correctamente', async () => {
            mockUserRepo.findOne.mockResolvedValue({ id: 'u1', balance: 100 });
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            const newBalance = await authService.updateBalance('u1', 50);
            expect(newBalance).toBe(150);
        });

        it('no debe permitir saldo negativo', async () => {
            mockUserRepo.findOne.mockResolvedValue({ id: 'u1', balance: 30 });
            mockUserRepo.update.mockResolvedValue({ affected: 1 });

            const newBalance = await authService.updateBalance('u1', -100);
            expect(newBalance).toBe(0); // Math.max(0, 30 - 100) = 0
        });

        it('debe lanzar error si el usuario no existe', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(authService.updateBalance('no-existe', 50)).rejects.toThrow('Usuario no encontrado');
        });
    });
});
