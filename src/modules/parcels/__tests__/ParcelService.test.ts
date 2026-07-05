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
const mockParcelRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn() };
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
const mockTrip = { id: 'trip-001', route: { id: 'route-001', company: mockCompany } };
const mockStartWaypoint = { id: 'wp-lima', stopOrder: 1 };
const mockEndWaypoint = { id: 'wp-huancayo', stopOrder: 3 };

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
                .mockResolvedValueOnce({ id: 'wp-huancayo', stopOrder: 3 })
                .mockResolvedValueOnce({ id: 'wp-lima', stopOrder: 1 });

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
