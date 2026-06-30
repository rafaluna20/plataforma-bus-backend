import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { logger } from '../logger';
import { TokenPayload } from '../../application/services/AuthService';
import { UserRole } from '../database/entities/UserEntity';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';

export class LocationGateway {
    private io: Server;

    constructor(io: Server) {
        this.io = io;
        this.setupRedisAdapter();
        this.setupEventListeners();
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

            // El pasajero se une a la sala del viaje para recibir actualizaciones
            socket.on('join_trip', (tripId: string) => {
                if (!tripId || typeof tripId !== 'string') {
                    socket.emit('error', { message: 'tripId inválido' });
                    return;
                }
                const room = `trip_${tripId}`;
                socket.join(room);
                logger.info(`[Socket] Cliente ${socket.id} se unió a la sala: ${room}`);
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
            socket.on('driver_update_location', (data: {
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
