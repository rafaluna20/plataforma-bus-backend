/**
 * Tests unitarios para AdminService
 * Cubre, sobre todo, las reglas de autorización recién cerradas: un ADMIN
 * (administrador de una empresa) NO debe poder auto-promoverse ni gestionar
 * usuarios de otra empresa — solo SUPER_ADMIN tiene alcance global.
 */

import { UserRole } from '../../infrastructure/database/entities/UserEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
};

const mockCompanyRepo = {
    findOne: jest.fn(),
};

const mockStationRepo = {
    findOne: jest.fn(),
};

jest.mock('../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'CompanyEntity') return mockCompanyRepo;
            if (name === 'StationEntity') return mockStationRepo;
            return mockUserRepo;
        }),
    },
}));

jest.mock('../../infrastructure/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { AdminService } from '../../application/services/AdminService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
    return {
        id: 'user-001',
        name: 'Juan Pérez',
        email: 'juan@test.com',
        role: UserRole.PASSENGER,
        company: { id: 'company-001' },
        isActive: true,
        ...overrides,
    };
}

describe('AdminService', () => {
    let service: AdminService;

    beforeEach(() => {
        service = new AdminService();
        jest.clearAllMocks();
        mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
    });

    // ─── updateUserRole() ─────────────────────────────────────────────────────

    describe('updateUserRole()', () => {
        it('un SUPER_ADMIN puede asignar el rol ADMIN a un usuario de cualquier empresa', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ company: { id: 'otra-empresa' } }));

            const result = await service.updateUserRole({
                userId: 'user-001', role: UserRole.ADMIN,
                actorRole: UserRole.SUPER_ADMIN, actorCompanyId: undefined,
            });

            expect(result.role).toBe(UserRole.ADMIN);
        });

        it('un SUPER_ADMIN puede asignar el rol SUPER_ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser());

            const result = await service.updateUserRole({
                userId: 'user-001', role: UserRole.SUPER_ADMIN,
                actorRole: UserRole.SUPER_ADMIN,
            });

            expect(result.role).toBe(UserRole.SUPER_ADMIN);
        });

        it('rechaza que un ADMIN se auto-promueva (o promueva a cualquiera) a ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ company: { id: 'company-001' } }));

            await expect(service.updateUserRole({
                userId: 'user-001', role: UserRole.ADMIN,
                actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            })).rejects.toThrow('Solo un SUPER_ADMIN puede asignar el rol ADMIN o SUPER_ADMIN');

            expect(mockUserRepo.save).not.toHaveBeenCalled();
        });

        it('rechaza que un ADMIN promueva a alguien a SUPER_ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ company: { id: 'company-001' } }));

            await expect(service.updateUserRole({
                userId: 'user-001', role: UserRole.SUPER_ADMIN,
                actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            })).rejects.toThrow('Solo un SUPER_ADMIN puede asignar el rol ADMIN o SUPER_ADMIN');
        });

        it('permite a un ADMIN promover a DRIVER a un usuario de su propia empresa', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ company: { id: 'company-001' } }));

            const result = await service.updateUserRole({
                userId: 'user-001', role: UserRole.DRIVER,
                actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            });

            expect(result.role).toBe(UserRole.DRIVER);
        });

        it('rechaza que un ADMIN gestione un usuario de OTRA empresa', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ company: { id: 'otra-empresa' } }));

            await expect(service.updateUserRole({
                userId: 'user-001', role: UserRole.DRIVER,
                actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            })).rejects.toThrow('Solo puedes gestionar usuarios de tu propia empresa');

            expect(mockUserRepo.save).not.toHaveBeenCalled();
        });

        it('nunca permite modificar el rol de un SUPER_ADMIN existente, ni siendo el actor SUPER_ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ role: UserRole.SUPER_ADMIN }));

            await expect(service.updateUserRole({
                userId: 'user-001', role: UserRole.ADMIN,
                actorRole: UserRole.SUPER_ADMIN,
            })).rejects.toThrow('No se puede modificar el rol de un SUPER_ADMIN');
        });

        it('lanza error si el usuario no existe', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(service.updateUserRole({
                userId: 'no-existe', role: UserRole.DRIVER, actorRole: UserRole.SUPER_ADMIN,
            })).rejects.toThrow('Usuario no encontrado');
        });
    });

    // ─── toggleUserStatus() ───────────────────────────────────────────────────

    describe('toggleUserStatus()', () => {
        it('un SUPER_ADMIN puede desactivar a un usuario de cualquier empresa', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ company: { id: 'otra-empresa' } }));

            const result = await service.toggleUserStatus('user-001', false, UserRole.SUPER_ADMIN, undefined);

            expect(result.message).toContain('desactivada');
        });

        it('nunca permite desactivar a un SUPER_ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ role: UserRole.SUPER_ADMIN }));

            await expect(service.toggleUserStatus('user-001', false, UserRole.SUPER_ADMIN))
                .rejects.toThrow('No se puede desactivar una cuenta SUPER_ADMIN');
        });

        it('rechaza que un ADMIN desactive a OTRO ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ role: UserRole.ADMIN, company: { id: 'company-001' } }));

            await expect(service.toggleUserStatus('user-001', false, UserRole.ADMIN, 'company-001'))
                .rejects.toThrow('No tienes permisos para modificar la cuenta de otro ADMIN');
        });

        it('rechaza que un ADMIN desactive a un usuario de OTRA empresa', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ role: UserRole.DRIVER, company: { id: 'otra-empresa' } }));

            await expect(service.toggleUserStatus('user-001', false, UserRole.ADMIN, 'company-001'))
                .rejects.toThrow('Solo puedes gestionar usuarios de tu propia empresa');
        });

        it('permite a un ADMIN desactivar a un DRIVER de su propia empresa', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser({ role: UserRole.DRIVER, company: { id: 'company-001' } }));

            const result = await service.toggleUserStatus('user-001', false, UserRole.ADMIN, 'company-001');

            expect(result.message).toContain('desactivada');
        });

        it('lanza error si el usuario no existe', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(service.toggleUserStatus('no-existe', true, UserRole.SUPER_ADMIN))
                .rejects.toThrow('Usuario no encontrado');
        });
    });

    // ─── createAdmin() ────────────────────────────────────────────────────────

    describe('createAdmin()', () => {
        it('crea un usuario ADMIN vinculado a la empresa indicada', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            mockCompanyRepo.findOne.mockResolvedValue({ id: 'company-001', tradeName: 'Transportes X' });
            mockUserRepo.create.mockImplementation((data) => data);

            const result = await service.createAdmin({
                name: 'Ana', email: 'ana@test.com', password: 'Password123!', companyId: 'company-001',
            });

            expect(result.role).toBe(UserRole.ADMIN);
            expect((result as any).passwordHash).toBeUndefined();
        });

        it('rechaza si el email ya está en uso', async () => {
            mockUserRepo.findOne.mockResolvedValue(makeUser());

            await expect(service.createAdmin({
                name: 'Ana', email: 'juan@test.com', password: 'Password123!', companyId: 'company-001',
            })).rejects.toThrow('Ya existe una cuenta registrada');
        });

        it('rechaza si la empresa no existe', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            mockCompanyRepo.findOne.mockResolvedValue(null);

            await expect(service.createAdmin({
                name: 'Ana', email: 'ana@test.com', password: 'Password123!', companyId: 'no-existe',
            })).rejects.toThrow('Empresa no encontrada');
        });
    });
});
