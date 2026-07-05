import { Server, Socket } from 'socket.io';
import { In } from 'typeorm';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { logger } from '../logger';
import { TokenPayload } from '../../application/services/AuthService';
import { UserRole } from '../database/entities/UserEntity';
import { TripManagementService } from '../../modules/trips';
import { AppDataSource } from '../database/data-source';
import { BookingEntity, PaymentStatus } from '../../modules/bookings/domain/BookingEntity';
import { TripEntity } from '../../modules/trips/domain/TripEntity';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('[FATAL] JWT_SECRET no está configurado. El servidor de sockets no puede arrancar de forma segura.');
}

const tripMgmtService = new TripManagementService();

/** Payload del usuario autenticado, adjuntado en el handshake (ver setupAuthMiddleware). */
function getSocketUser(socket: Socket): TokenPayload {
    return (socket.data as { user: TokenPayload }).user;
}

/** ¿El usuario puede ver el tracking en vivo de este viaje? */
async function canViewTrip(user: TokenPayload, tripId: string): Promise<boolean> {
    if (user.role === UserRole.SUPER_ADMIN) return true;

    if (user.role === UserRole.DRIVER) {
        return tripMgmtService.isDriverAssignedToTrip(user.sub, tripId);
    }

    if (user.role === UserRole.ADMIN || user.role === UserRole.AGENCY_SELLER) {
        const trip = await AppDataSource.getRepository(TripEntity).findOne({
            where: { id: tripId },
            relations: { route: { company: true } },
        });
        return !!trip && trip.route?.company?.id === user.companyId;
    }

    // PASSENGER u otros roles: solo si tienen un pasaje activo en este viaje
    const activeStatuses = [PaymentStatus.PENDING_CASH, PaymentStatus.PAID_DIGITAL, PaymentStatus.PAID];
    const bookingCount = await AppDataSource.getRepository(BookingEntity).count({
        where: {
            trip: { id: tripId },
            user: { id: user.sub },
            paymentStatus: In(activeStatuses),
        },
    });
    return bookingCount > 0;
}

export class LocationGateway {
    private io: Server;

    constructor(io: Server) {
        this.io = io;
        this.setupRedisAdapter();
        this.setupAuthMiddleware();
        this.setupEventListeners();
    }

    /**
     * SEGURIDAD: exige un JWT válido en el handshake antes de aceptar la conexión.
     * Sin esto, cualquiera podía conectarse anónimamente y suscribirse (`join_trip`)
     * al tracking en vivo de cualquier bus con solo conocer el tripId.
     */
    private setupAuthMiddleware() {
        this.io.use((socket: Socket, next) => {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;

            if (!token || typeof token !== 'string') {
                return next(new Error('Se requiere autenticación para conectarse'));
            }

            try {
                const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
                (socket.data as { user: TokenPayload }).user = payload;
                next();
            } catch {
                next(new Error('Token inválido o expirado'));
            }
        });
    }

    private setupRedisAdapter() {
        const redisUrl = process.env.REDIS_URL;

        // Si REDIS_URL no está configurada, usar adaptador en memoria (no intentar localhost)
        if (!redisUrl) {
            logger.info('[Socket.io] REDIS_URL no configurada. Usando adaptador en memoria.');
            return;
        }

        try {
            const pubClient = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                enableReadyCheck: false,
                lazyConnect: true,
            });
            const subClient = pubClient.duplicate();

            pubClient.on('error', (err) => logger.warn('Redis Pub Error:', { message: err.message }));
            subClient.on('error', (err) => logger.warn('Redis Sub Error:', { message: err.message }));

            pubClient.connect().then(() => {
                this.io.adapter(createAdapter(pubClient, subClient));
                logger.info('✅ Redis Adapter configurado para Socket.io (Escalabilidad habilitada)');
            }).catch((err) => {
                logger.warn(`⚠️ No se pudo conectar a Redis: ${err.message}. Usando adaptador en memoria.`);
            });
        } catch (error: any) {
            logger.warn(`⚠️ Error al inicializar Redis: ${error.message}. Usando adaptador en memoria.`);
        }
    }

    private setupEventListeners() {
        this.io.on('connection', (socket: Socket) => {
            logger.info(`[Socket] Nuevo cliente conectado: ${socket.id}`);

            // El pasajero se une a la sala del viaje para recibir actualizaciones.
            // SEGURIDAD: solo puede unirse quien tenga un pasaje activo en ese
            // viaje, esté asignado como conductor, o sea ADMIN/SUPER_ADMIN de la
            // empresa dueña — de lo contrario, cualquier cliente autenticado
            // podría espiar el GPS en vivo de cualquier bus con solo el tripId.
            socket.on('join_trip', async (tripId: string) => {
                if (!tripId || typeof tripId !== 'string') {
                    socket.emit('error', { message: 'tripId inválido' });
                    return;
                }

                const user = getSocketUser(socket);
                try {
                    const allowed = await canViewTrip(user, tripId);
                    if (!allowed) {
                        logger.warn(`[Socket] ${user.email} intentó unirse a un viaje sin permisos: ${tripId}`);
                        socket.emit('error', { message: 'No tienes permisos para ver el tracking de este viaje' });
                        return;
                    }
                } catch (err: any) {
                    logger.error(`[Socket] Error verificando permisos de tracking: ${err.message}`);
                    socket.emit('error', { message: 'No se pudo verificar el acceso a este viaje' });
                    return;
                }

                const room = `trip_${tripId}`;
                socket.join(room);
                logger.info(`[Socket] Cliente ${socket.id} (${user.email}) se unió a la sala: ${room}`);
            });

            // El pasajero abandona la sala
            socket.on('leave_trip', (tripId: string) => {
                if (!tripId || typeof tripId !== 'string') return;
                const room = `trip_${tripId}`;
                socket.leave(room);
                logger.info(`[Socket] Cliente ${socket.id} abandonó la sala: ${room}`);
            });

            /**
             * El chofer envía la actualización de GPS.
             * SEGURIDAD: Verificar que el emisor tiene un JWT válido con rol DRIVER o ADMIN.
             * Payload esperado: { tripId, lat, lng, speed?, bearing?, token }
             */
            socket.on('driver_update_location', async (data: {
                tripId: string;
                lat: number;
                lng: number;
                speed?: number;
                bearing?: number;
                token: string; // JWT del conductor
            }) => {
                // 1. Validar estructura del payload
                if (!data.tripId || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
                    socket.emit('error', { message: 'Payload de ubicación inválido' });
                    return;
                }

                // 2. Validar coordenadas dentro de rangos razonables (Perú: lat -18 a 0, lng -82 a -68)
                if (data.lat < -20 || data.lat > 2 || data.lng < -85 || data.lng > -65) {
                    logger.warn(`[Socket] Coordenadas fuera de rango de Perú: lat=${data.lat}, lng=${data.lng}`);
                    socket.emit('error', { message: 'Coordenadas fuera del rango permitido' });
                    return;
                }

                // 3. Verificar JWT del conductor
                if (!data.token) {
                    socket.emit('error', { message: 'Se requiere token de autenticación para emitir ubicación' });
                    return;
                }

                let payload: TokenPayload;
                try {
                    payload = jwt.verify(data.token, JWT_SECRET) as TokenPayload;
                } catch {
                    socket.emit('error', { message: 'Token inválido o expirado' });
                    return;
                }

                // 4. Verificar que el usuario tiene rol de DRIVER o ADMIN
                if (payload.role !== UserRole.DRIVER && payload.role !== UserRole.ADMIN && payload.role !== UserRole.SUPER_ADMIN) {
                    socket.emit('error', { message: 'Solo los conductores pueden emitir actualizaciones de ubicación' });
                    return;
                }

                // 4b. SEGURIDAD: un DRIVER solo puede emitir GPS para viajes que tiene asignados.
                // ADMIN/SUPER_ADMIN quedan exentos (monitoreo/pruebas de su empresa).
                if (payload.role === UserRole.DRIVER) {
                    try {
                        const assigned = await tripMgmtService.isDriverAssignedToTrip(payload.sub, data.tripId);
                        if (!assigned) {
                            logger.warn(`[Socket] Conductor ${payload.email} intentó emitir GPS para un viaje no asignado: ${data.tripId}`);
                            socket.emit('error', { message: 'No estás asignado a este viaje' });
                            return;
                        }
                    } catch (err: any) {
                        logger.error(`[Socket] Error verificando asignación de conductor: ${err.message}`);
                        socket.emit('error', { message: 'No se pudo verificar la asignación del viaje' });
                        return;
                    }
                }

                // 5. Reenviar a todos en la sala (excepto al que envía)
                const room = `trip_${data.tripId}`;
                socket.to(room).emit('location_updated', {
                    tripId: data.tripId,
                    lat: data.lat,
                    lng: data.lng,
                    speed: data.speed || 0,
                    bearing: data.bearing || 0,
                    timestamp: new Date().toISOString(),
                    driverId: payload.sub,
                });

                logger.info(`[Socket] GPS actualizado: tripId=${data.tripId} | lat=${data.lat} | lng=${data.lng} | driver=${payload.email}`);
            });

            socket.on('disconnect', () => {
                logger.info(`[Socket] Cliente desconectado: ${socket.id}`);
            });

            socket.on('error', (err) => {
                logger.error(`[Socket] Error en socket ${socket.id}:`, { message: err.message });
            });
        });
    }
}
