import { Server } from 'socket.io';
import { logger } from '../logger';

/**
 * Punto de acceso desacoplado a la instancia de Socket.io para que servicios de
 * aplicación (que no deben conocer detalles de transporte/red) puedan emitir eventos
 * a la sala de un viaje. Se mantiene separado de LocationGateway porque LocationGateway
 * ya importa TripManagementService: si TripManagementService importara LocationGateway
 * directamente para emitir eventos, se formaría un import circular entre ambos módulos.
 */
let io: Server | null = null;

export function setSocketServer(server: Server): void {
    io = server;
}

/** Emite un evento a todos los clientes unidos a la sala de un viaje (misma sala `trip_{tripId}` que usa LocationGateway para el GPS). */
export function emitToTrip(tripId: string, event: string, payload: Record<string, unknown>): void {
    if (!io) {
        // Socket.io aún no se inicializó (tests unitarios, scripts CLI) — no es un error.
        return;
    }
    try {
        io.to(`trip_${tripId}`).emit(event, payload);
    } catch (error: any) {
        logger.warn(`[SocketBus] No se pudo emitir evento "${event}" para el viaje ${tripId}: ${error.message}`);
    }
}
