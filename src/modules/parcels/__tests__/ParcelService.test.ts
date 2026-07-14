/**
 * Tests unitarios para ParcelService
 * Cubre el registro de encomiendas y el scoping por empresa (multi-tenancy):
 * el modulo Parcels es 100% staff (ADMIN/SUPER_ADMIN/AGENCY_SELLER — no hay
 * flujo self-service de pasajero), asi que el scoping aplica siempre salvo
 * para SUPER_ADMIN.
 */

import { ParcelStatus } from '../domain/ParcelEntity';
import { PaymentStatus } from '../../bookings/domain/BookingEntity';
import { UserRole } from '../../../infrastructure/database/entities/UserEntity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockTripRepo = { findOne: jest.fn() };
const mockWaypointRepo = { findOne: jest.fn() };
const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
};
const mockParcelRepo = {
    create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
};
const mockUserRepo = { findOne: jest.fn() };

jest.mock('../../../infrastructure/database/data-source', () => ({
    AppDataSource: {
        getRepository: jest.fn((entity) => {
            const name = entity?.name || '';
            if (name === 'TripEntity') return mockTripRepo;
            if (name === 'RouteWaypointEntity') return mockWaypointRepo;
            if (name === 'ParcelEntity') return mockParcelRepo;
            if (name === 'UserEntity') return mockUserRepo;
            return mockParcelRepo;
        }),
    },
}));

jest.mock('../../../infrastructure/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ParcelService } from '../application/ParcelService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCompany = { id: 'company-001', tradeName: 'Transportes Lima' };
const mockRoute = { id: 'route-001', company: mockCompany };
const mockTrip = { id: 'trip-001', route: mockRoute };
const mockStartWaypoint = { id: 'wp-lima', stopOrder: 1, route: mockRoute };
const mockEndWaypoint = { id: 'wp-huancayo', stopOrder: 3, route: mockRoute };

const baseParcelData = {
    tripId: 'trip-001',
    senderName: 'Juan Pérez',
    senderDoc: '12345678',
    receiverName: 'María López',
    receiverDoc: '87654321',
    startWaypointId: 'wp-lima',
    endWaypointId: 'wp-huancayo',
    totalPrice: 30,
};

describe('ParcelService', () => {
    let parcelService: ParcelService;

    beforeEach(() => {
        parcelService = new ParcelService();
        jest.clearAllMocks();
    });

    describe('createParcel()', () => {
        it('debe crear una encomienda correctamente', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            const saved = { id: 'parcel-001', ...baseParcelData, status: ParcelStatus.RECEIVED, paymentStatus: PaymentStatus.PENDING_CASH };
            mockParcelRepo.create.mockReturnValue(saved);
            mockParcelRepo.save.mockResolvedValue(saved);

            const result = await parcelService.createParcel(baseParcelData);

            expect(result.status).toBe(ParcelStatus.RECEIVED);
        });

        it('debe lanzar error si el viaje no existe', async () => {
            mockTripRepo.findOne.mockResolvedValue(null);

            await expect(parcelService.createParcel(baseParcelData))
                .rejects.toThrow('Viaje no encontrado');
        });

        it('debe lanzar error si el origen está después del destino', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce({ id: 'wp-huancayo', stopOrder: 3, route: mockRoute })
                .mockResolvedValueOnce({ id: 'wp-lima', stopOrder: 1, route: mockRoute });

            await expect(parcelService.createParcel(baseParcelData))
                .rejects.toThrow('origen debe ser antes del destino');
        });

        it('debe lanzar error si el precio es 0 o negativo', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);

            await expect(parcelService.createParcel({ ...baseParcelData, totalPrice: 0 }))
                .rejects.toThrow('precio total debe ser mayor a 0');
        });

        // ─── Multi-tenancy ────────────────────────────────────────────────────

        it('NO debe permitir que un AGENCY_SELLER de otra empresa registre una encomienda en este viaje', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip); // company-001

            await expect(parcelService.createParcel({
                ...baseParcelData,
                actorRole: UserRole.AGENCY_SELLER,
                actorCompanyId: 'otra-empresa',
            })).rejects.toThrow('otra empresa');
        });

        it('debe permitir a un AGENCY_SELLER de la MISMA empresa registrar la encomienda', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockParcelRepo.create.mockReturnValue({ id: 'p1', status: ParcelStatus.RECEIVED });
            mockParcelRepo.save.mockResolvedValue({ id: 'p1', status: ParcelStatus.RECEIVED });

            await expect(parcelService.createParcel({
                ...baseParcelData,
                actorRole: UserRole.AGENCY_SELLER,
                actorCompanyId: 'company-001',
            })).resolves.not.toThrow();
        });

        it('no debe exponer passwordHash ni refreshToken del vendedor en la respuesta', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockUserRepo.findOne.mockResolvedValue({
                id: 'seller-001', name: 'Vendedor', passwordHash: 'hash-secreto', refreshToken: 'token-secreto',
            });
            const saved = {
                id: 'p1', status: ParcelStatus.RECEIVED,
                seller: { id: 'seller-001', name: 'Vendedor', passwordHash: 'hash-secreto', refreshToken: 'token-secreto' },
            };
            mockParcelRepo.create.mockReturnValue(saved);
            mockParcelRepo.save.mockResolvedValue(saved);

            const result = await parcelService.createParcel({ ...baseParcelData, sellerId: 'seller-001' });

            expect(result.seller).not.toHaveProperty('passwordHash');
            expect(result.seller).not.toHaveProperty('refreshToken');
            expect((result.seller as any).name).toBe('Vendedor');
        });

        it('SUPER_ADMIN debe poder registrar encomiendas en cualquier empresa', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockWaypointRepo.findOne
                .mockResolvedValueOnce(mockStartWaypoint)
                .mockResolvedValueOnce(mockEndWaypoint);
            mockParcelRepo.create.mockReturnValue({ id: 'p1', status: ParcelStatus.RECEIVED });
            mockParcelRepo.save.mockResolvedValue({ id: 'p1', status: ParcelStatus.RECEIVED });

            await expect(parcelService.createParcel({
                ...baseParcelData,
                actorRole: UserRole.SUPER_ADMIN,
                actorCompanyId: 'otra-empresa-cualquiera',
            })).resolves.not.toThrow();
        });
    });

    describe('getParcelsByTrip()', () => {
        it('NO debe permitir ver encomiendas de un viaje de otra empresa', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip); // company-001

            await expect(parcelService.getParcelsByTrip('trip-001', UserRole.ADMIN, 'otra-empresa'))
                .rejects.toThrow('otra empresa');
        });

        it('debe permitir ver encomiendas de un viaje de la misma empresa', async () => {
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockParcelRepo.find.mockResolvedValue([]);

            await expect(parcelService.getParcelsByTrip('trip-001', UserRole.ADMIN, 'company-001'))
                .resolves.toEqual([]);
        });

        it('debe lanzar error si el viaje no existe', async () => {
            mockTripRepo.findOne.mockResolvedValue(null);

            await expect(parcelService.getParcelsByTrip('no-existe'))
                .rejects.toThrow('Viaje no encontrado');
        });
    });

    describe('updateParcelStatus()', () => {
        it('NO debe permitir actualizar una encomienda de otra empresa', async () => {
            mockParcelRepo.findOne.mockResolvedValue({ id: 'p1', trip: mockTrip });

            await expect(
                parcelService.updateParcelStatus('p1', { status: ParcelStatus.DELIVERED }, UserRole.AGENCY_SELLER, 'otra-empresa')
            ).rejects.toThrow('otra empresa');
        });

        it('debe actualizar el estado si la encomienda es de la misma empresa', async () => {
            const parcel = { id: 'p1', trip: mockTrip, status: ParcelStatus.RECEIVED };
            mockParcelRepo.findOne.mockResolvedValue(parcel);
            mockParcelRepo.save.mockResolvedValue({ ...parcel, status: ParcelStatus.DELIVERED });

            const result = await parcelService.updateParcelStatus(
                'p1', { status: ParcelStatus.DELIVERED }, UserRole.AGENCY_SELLER, 'company-001'
            );
            expect(result.status).toBe(ParcelStatus.DELIVERED);
        });

        it('debe lanzar error si la encomienda no existe', async () => {
            mockParcelRepo.findOne.mockResolvedValue(null);

            await expect(parcelService.updateParcelStatus('no-existe', { status: ParcelStatus.DELIVERED }))
                .rejects.toThrow('Encomienda no encontrada');
        });

        it('NO debe permitir avanzar a IN_TRANSIT sin viaje asignado (pendiente en bandeja)', async () => {
            mockParcelRepo.findOne.mockResolvedValue({
                id: 'p1', trip: null, status: ParcelStatus.RECEIVED, startWaypoint: mockStartWaypoint,
            });

            await expect(
                parcelService.updateParcelStatus('p1', { status: ParcelStatus.IN_TRANSIT }, UserRole.ADMIN, 'company-001')
            ).rejects.toThrow('asignar un viaje');
        });

        it('debe permitir marcar CANCELLED aunque la encomienda esté sin viaje asignado', async () => {
            const parcel = { id: 'p1', trip: null, status: ParcelStatus.RECEIVED, startWaypoint: mockStartWaypoint };
            mockParcelRepo.findOne.mockResolvedValue(parcel);
            mockParcelRepo.save.mockResolvedValue({ ...parcel, status: ParcelStatus.CANCELLED });

            const result = await parcelService.updateParcelStatus(
                'p1', { status: ParcelStatus.CANCELLED }, UserRole.ADMIN, 'company-001'
            );
            expect(result.status).toBe(ParcelStatus.CANCELLED);
        });
    });

    describe('getPendingParcels()', () => {
        it('NO debe permitir listar la bandeja de otra empresa', async () => {
            await expect(
                parcelService.getPendingParcels('company-001', {}, UserRole.ADMIN, 'otra-empresa')
            ).rejects.toThrow('otra empresa');
        });

        it('debe listar las encomiendas pendientes (sin viaje) de la propia empresa', async () => {
            mockQueryBuilder.getMany.mockResolvedValue([{ id: 'p1', trip: null }]);

            const result = await parcelService.getPendingParcels('company-001', {}, UserRole.ADMIN, 'company-001');

            expect(result).toEqual([{ id: 'p1', trip: null }]);
            expect(mockQueryBuilder.where).toHaveBeenCalledWith('parcel.trip_id IS NULL');
        });

        it('debe aplicar los filtros de origen/destino cuando se indican', async () => {
            mockQueryBuilder.getMany.mockResolvedValue([]);

            await parcelService.getPendingParcels(
                'company-001',
                { startWaypointId: 'wp-lima', endWaypointId: 'wp-huancayo' },
                UserRole.ADMIN, 'company-001'
            );

            expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('parcel.start_waypoint_id = :sw', { sw: 'wp-lima' });
            expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('parcel.end_waypoint_id = :ew', { ew: 'wp-huancayo' });
        });
    });

    describe('reassignParcel()', () => {
        it('debe asignar un viaje a una encomienda pendiente (sin viaje)', async () => {
            const parcel = { id: 'p1', trip: null, status: ParcelStatus.RECEIVED, startWaypoint: mockStartWaypoint };
            mockParcelRepo.findOne.mockResolvedValue(parcel);
            mockTripRepo.findOne.mockResolvedValue(mockTrip);
            mockParcelRepo.save.mockImplementation(async (p) => p);

            const result = await parcelService.reassignParcel('p1', 'trip-001', UserRole.ADMIN, 'company-001');

            expect(result.trip).toEqual(mockTrip);
        });

        it('debe quitar el viaje (volver a la bandeja) cuando newTripId es null', async () => {
            const parcel = { id: 'p1', trip: mockTrip, status: ParcelStatus.RECEIVED, startWaypoint: mockStartWaypoint };
            mockParcelRepo.findOne.mockResolvedValue(parcel);
            mockParcelRepo.save.mockImplementation(async (p) => p);

            const result = await parcelService.reassignParcel('p1', null, UserRole.ADMIN, 'company-001');

            expect(result.trip).toBeNull();
        });

        it('NO debe permitir reasignar una encomienda ya entregada', async () => {
            mockParcelRepo.findOne.mockResolvedValue({
                id: 'p1', trip: mockTrip, status: ParcelStatus.DELIVERED, startWaypoint: mockStartWaypoint,
            });

            await expect(
                parcelService.reassignParcel('p1', 'trip-002', UserRole.ADMIN, 'company-001')
            ).rejects.toThrow('entregada o cancelada');
        });

        it('NO debe permitir reasignar a un viaje de una ruta distinta', async () => {
            const parcel = { id: 'p1', trip: null, status: ParcelStatus.RECEIVED, startWaypoint: mockStartWaypoint };
            mockParcelRepo.findOne.mockResolvedValue(parcel);
            mockTripRepo.findOne.mockResolvedValue({ id: 'trip-002', route: { id: 'route-999', company: mockCompany } });

            await expect(
                parcelService.reassignParcel('p1', 'trip-002', UserRole.ADMIN, 'company-001')
            ).rejects.toThrow('misma ruta');
        });

        it('NO debe permitir reasignar una encomienda de otra empresa', async () => {
            mockParcelRepo.findOne.mockResolvedValue({
                id: 'p1', trip: mockTrip, status: ParcelStatus.RECEIVED, startWaypoint: mockStartWaypoint,
            });

            await expect(
                parcelService.reassignParcel('p1', 'trip-002', UserRole.AGENCY_SELLER, 'otra-empresa')
            ).rejects.toThrow('otra empresa');
        });
    });

    describe('getParcelById()', () => {
        it('NO debe permitir ver una encomienda de otra empresa', async () => {
            mockParcelRepo.findOne.mockResolvedValue({ id: 'p1', trip: mockTrip });

            await expect(parcelService.getParcelById('p1', UserRole.ADMIN, 'otra-empresa'))
                .rejects.toThrow('otra empresa');
        });

        it('debe devolver la encomienda si pertenece a la misma empresa', async () => {
            const parcel = { id: 'p1', trip: mockTrip };
            mockParcelRepo.findOne.mockResolvedValue(parcel);

            const result = await parcelService.getParcelById('p1', UserRole.ADMIN, 'company-001');
            expect(result.id).toBe('p1');
        });
    });
});
