import { UserRole } from '../database/entities/UserEntity';

/**
 * Roles de "staff" que operan en nombre de una empresa (y por lo tanto deben
 * quedar confinados a los recursos de SU empresa). SUPER_ADMIN se maneja
 * aparte (acceso global). PASSENGER no aplica: un pasajero compra pasajes de
 * cualquier empresa del marketplace, eso es el flujo B2C normal, no una fuga.
 */
const COMPANY_SCOPED_ROLES = [UserRole.ADMIN, UserRole.AGENCY_SELLER, UserRole.DRIVER];

/**
 * Verifica que el actor pertenezca a la misma empresa que el recurso sobre el
 * que intenta operar (trip, booking, parcel, etc. — siempre a través de la
 * empresa dueña de la ruta del viaje). Lanza si no, con un mensaje que los
 * controllers mapean a 403.
 *
 * - SUPER_ADMIN: bypass total (acceso a cualquier empresa).
 * - ADMIN / AGENCY_SELLER / DRIVER: deben coincidir con resourceCompanyId.
 * - Cualquier otro rol (ej. PASSENGER): no se restringe aquí — el marketplace
 *   B2C permite comprar en cualquier empresa.
 */
export function assertSameCompany(
    actorRole: UserRole | undefined,
    actorCompanyId: string | undefined,
    resourceCompanyId: string | undefined,
): void {
    if (actorRole === UserRole.SUPER_ADMIN) return;
    if (!actorRole || !COMPANY_SCOPED_ROLES.includes(actorRole)) return;

    if (!actorCompanyId || !resourceCompanyId || actorCompanyId !== resourceCompanyId) {
        throw new Error('No tienes permisos para acceder a un recurso de otra empresa');
    }
}
