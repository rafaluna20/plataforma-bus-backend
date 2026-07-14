/**
 * Tests unitarios para FareRuleService
 * Cubre: resolución del multiplicador de tarifa (franja horaria, franja que
 * cruza medianoche, días de la semana, fecha específica, prioridad entre
 * reglas), aplicación a waypoints, y el scoping por empresa del CRUD.
 */

import { FareRuleType } from '../../../infrastructure/database/entities/FareRuleEntity';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFareRuleRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
};

const mockRouteRepo = {
    findOne: jest.fn(),
};

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'RouteEntity') return mockRouteRepo;
            return mockFareRuleRepo;
        }),
    },
}));

import { FareRuleService } from '../FareRuleService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCompany = { id: 'company-001', tradeName: 'Transportes Lima' };
const mockRoute = { id: 'route-001', company: mockCompany };

// 2026-07-15 es miércoles. 09:00 hora Perú (UTC-5) = 14:00 UTC.
const morningWed = new Date('2026-07-15T14:00:00.000Z');
// 22:30 hora Perú = 03:30 UTC del día siguiente.
const lateNightWed = new Date('2026-07-16T03:30:00.000Z');
// Domingo 2026-07-19, 09:00 hora Perú.
const morningSun = new Date('2026-07-19T14:00:00.000Z');

describe('FareRuleService', () => {
    let service: FareRuleService;

    beforeEach(() => {
        service = new FareRuleService();
        jest.clearAllMocks();
    });

    describe('getMultiplier()', () => {
        it('debe devolver 1 si no hay reglas configuradas para la ruta', async () => {
            mockFareRuleRepo.find.mockResolvedValue([]);
            const result = await service.getMultiplier('route-001', morningWed);
            expect(result).toBe(1);
        });

        it('debe aplicar una regla de franja horaria simple que coincide', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 0.75, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed); // 09:00
            expect(result).toBe(0.75);
        });

        it('debe funcionar cuando departureTime llega como string ISO (round-trip por caché Redis)', async () => {
            // Bug real: tras un cache-hit, TripEntity.departureTime viene deserializado
            // de Redis como string, no como instancia de Date -- toPeruLocal() explotaba
            // con "date.getTime is not a function" si no se recasteaba primero.
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 0.75, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed.toISOString());
            expect(result).toBe(0.75);
        });

        it('NO debe aplicar una franja horaria que no coincide con la hora de salida', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '19:00', endTime: '23:59', daysOfWeek: null, priceMultiplier: 1.35, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed); // 09:00, fuera de 19:00-23:59
            expect(result).toBe(1);
        });

        it('debe resolver correctamente una franja horaria que cruza medianoche (ej. 22:00-05:00)', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '22:00', endTime: '05:00', daysOfWeek: null, priceMultiplier: 1.4, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', lateNightWed); // 22:30
            expect(result).toBe(1.4);
        });

        it('debe respetar el filtro de días de la semana', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                // Solo fines de semana (0=domingo, 6=sábado)
                { ruleType: FareRuleType.TIME_BAND, startTime: '00:00', endTime: '23:59', daysOfWeek: [0, 6], priceMultiplier: 1.2, priority: 0 },
            ]);
            const midweek = await service.getMultiplier('route-001', morningWed); // miércoles
            const weekend = await service.getMultiplier('route-001', morningSun); // domingo
            expect(midweek).toBe(1);
            expect(weekend).toBe(1.2);
        });

        it('debe aplicar una regla de fecha específica dentro del rango', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.SPECIFIC_DATE, startDate: '2026-07-15', endDate: '2026-07-16', priceMultiplier: 1.5, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed); // 2026-07-15
            expect(result).toBe(1.5);
        });

        it('NO debe aplicar una regla de fecha específica fuera del rango', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.SPECIFIC_DATE, startDate: '2026-12-25', endDate: '2026-12-25', priceMultiplier: 2, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed);
            expect(result).toBe(1);
        });

        it('a igual prioridad, SPECIFIC_DATE debe ganar sobre TIME_BAND', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 0.75, priority: 0 },
                { ruleType: FareRuleType.SPECIFIC_DATE, startDate: '2026-07-15', endDate: '2026-07-15', priceMultiplier: 2, priority: 0 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed);
            expect(result).toBe(2);
        });

        it('debe respetar priority explícita por sobre el tipo de regla', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 0.6, priority: 10 },
                { ruleType: FareRuleType.SPECIFIC_DATE, startDate: '2026-07-15', endDate: '2026-07-15', priceMultiplier: 2, priority: 1 },
            ]);
            const result = await service.getMultiplier('route-001', morningWed);
            expect(result).toBe(0.6);
        });

        it('debe ignorar reglas inactivas (el repo ya filtra isActive=true, pero confirma el where)', async () => {
            mockFareRuleRepo.find.mockResolvedValue([]);
            await service.getMultiplier('route-001', morningWed);
            expect(mockFareRuleRepo.find).toHaveBeenCalledWith({
                where: { route: { id: 'route-001' }, isActive: true },
            });
        });
    });

    describe('applyToWaypoints()', () => {
        it('debe multiplicar basePrice y basePriceFloor1 sin mutar el arreglo original', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 1.5, priority: 0 },
            ]);
            const waypoints = [{ id: 'wp1', basePrice: 40, basePriceFloor1: 60 }];

            const result = await service.applyToWaypoints('route-001', morningWed, waypoints);

            expect(result[0].basePrice).toBe(60);
            expect(result[0].basePriceFloor1).toBe(90);
            expect(waypoints[0].basePrice).toBe(40); // original intacto
        });

        it('debe devolver el mismo arreglo (sin copiar) cuando el multiplicador es 1', async () => {
            mockFareRuleRepo.find.mockResolvedValue([]);
            const waypoints = [{ id: 'wp1', basePrice: 40, basePriceFloor1: null }];

            const result = await service.applyToWaypoints('route-001', morningWed, waypoints);

            expect(result).toBe(waypoints);
        });

        it('debe dejar basePriceFloor1 en null si ya era null (no inventa un valor)', async () => {
            mockFareRuleRepo.find.mockResolvedValue([
                { ruleType: FareRuleType.TIME_BAND, startTime: '08:00', endTime: '12:00', daysOfWeek: null, priceMultiplier: 1.5, priority: 0 },
            ]);
            const waypoints = [{ id: 'wp1', basePrice: 40, basePriceFloor1: null }];

            const result = await service.applyToWaypoints('route-001', morningWed, waypoints);

            expect(result[0].basePriceFloor1).toBeNull();
        });
    });

    describe('create() — scoping por empresa', () => {
        it('NO debe permitir crear una regla en una ruta de otra empresa', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute); // company-001

            await expect(service.create({
                routeId: 'route-001', name: 'Nocturna', ruleType: FareRuleType.TIME_BAND,
                startTime: '19:00', endTime: '23:59', priceMultiplier: 1.3,
                actorRole: UserRole.ADMIN, actorCompanyId: 'otra-empresa',
            })).rejects.toThrow('otra empresa');
        });

        it('debe crear la regla si la ruta pertenece a la empresa del actor', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);
            mockFareRuleRepo.create.mockReturnValue({ id: 'rule-1' });
            mockFareRuleRepo.save.mockResolvedValue({ id: 'rule-1' });

            await expect(service.create({
                routeId: 'route-001', name: 'Nocturna', ruleType: FareRuleType.TIME_BAND,
                startTime: '19:00', endTime: '23:59', priceMultiplier: 1.3,
                actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            })).resolves.not.toThrow();
        });

        it('debe rechazar una regla TIME_BAND sin startTime/endTime', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);

            await expect(service.create({
                routeId: 'route-001', name: 'Incompleta', ruleType: FareRuleType.TIME_BAND,
                priceMultiplier: 1.3, actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            })).rejects.toThrow('requieren startTime y endTime');
        });

        it('debe rechazar una regla SPECIFIC_DATE sin startDate', async () => {
            mockRouteRepo.findOne.mockResolvedValue(mockRoute);

            await expect(service.create({
                routeId: 'route-001', name: 'Incompleta', ruleType: FareRuleType.SPECIFIC_DATE,
                priceMultiplier: 1.3, actorRole: UserRole.ADMIN, actorCompanyId: 'company-001',
            })).rejects.toThrow('requieren startDate');
        });
    });

    describe('update() / delete() — scoping por empresa', () => {
        it('NO debe permitir actualizar una regla de otra empresa', async () => {
            mockFareRuleRepo.findOne.mockResolvedValue({ id: 'rule-1', route: mockRoute });

            await expect(service.update('rule-1', { isActive: false }, UserRole.ADMIN, 'otra-empresa'))
                .rejects.toThrow('otra empresa');
        });

        it('NO debe permitir eliminar una regla de otra empresa', async () => {
            mockFareRuleRepo.findOne.mockResolvedValue({ id: 'rule-1', route: mockRoute });

            await expect(service.delete('rule-1', UserRole.ADMIN, 'otra-empresa'))
                .rejects.toThrow('otra empresa');
        });

        it('debe permitir desactivar una regla de la propia empresa', async () => {
            const rule = { id: 'rule-1', route: mockRoute, isActive: true };
            mockFareRuleRepo.findOne.mockResolvedValue(rule);
            mockFareRuleRepo.save.mockImplementation(async (r) => r);

            const result = await service.update('rule-1', { isActive: false }, UserRole.ADMIN, 'company-001');
            expect(result.isActive).toBe(false);
        });
    });
});
