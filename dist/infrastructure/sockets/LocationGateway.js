"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationGateway = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis_adapter_1 = require("@socket.io/redis-adapter");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("../logger");
const UserEntity_1 = require("../database/entities/UserEntity");
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
class LocationGateway {
    constructor(io) {
        this.io = io;
        this.setupRedisAdapter();
        this.setupEventListeners();
    }
    setupRedisAdapter() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        try {
            const pubClient = new ioredis_1.default(redisUrl);
            const subClient = pubClient.duplicate();
            pubClient.on('error', (err) => logger_1.logger.warn('Redis Pub Error (Using Memory Adapter Fallback):', { message: err.message }));
            subClient.on('error', (err) => logger_1.logger.warn('Redis Sub Error (Using Memory Adapter Fallback):', { message: err.message }));
            this.io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
            logger_1.logger.info('✅ Redis Adapter configurado para Socket.io (Escalabilidad habilitada)');
        }
        catch (error) {
            logger_1.logger.warn('⚠️ No se pudo conectar a Redis. Usando adaptador en memoria.');
        }
    }
    setupEventListeners() {
        this.io.on('connection', (socket) => {
            logger_1.logger.info(`[Socket] Nuevo cliente conectado: ${socket.id}`);
            // El pasajero se une a la sala del viaje para recibir actualizaciones
            socket.on('join_trip', (tripId) => {
                if (!tripId || typeof tripId !== 'string') {
                    socket.emit('error', { message: 'tripId inválido' });
                    return;
                }
                const room = `trip_${tripId}`;
                socket.join(room);
                logger_1.logger.info(`[Socket] Cliente ${socket.id} se unió a la sala: ${room}`);
            });
            // El pasajero abandona la sala
            socket.on('leave_trip', (tripId) => {
                if (!tripId || typeof tripId !== 'string')
                    return;
                const room = `trip_${tripId}`;
                socket.leave(room);
                logger_1.logger.info(`[Socket] Cliente ${socket.id} abandonó la sala: ${room}`);
            });
            /**
             * El chofer envía la actualización de GPS.
             * SEGURIDAD: Verificar que el emisor tiene un JWT válido con rol DRIVER o ADMIN.
             * Payload esperado: { tripId, lat, lng, speed?, bearing?, token }
             */
            socket.on('driver_update_location', (data) => {
                // 1. Validar estructura del payload
                if (!data.tripId || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
                    socket.emit('error', { message: 'Payload de ubicación inválido' });
                    return;
                }
                // 2. Validar coordenadas dentro de rangos razonables (Perú: lat -18 a 0, lng -82 a -68)
                if (data.lat < -20 || data.lat > 2 || data.lng < -85 || data.lng > -65) {
                    logger_1.logger.warn(`[Socket] Coordenadas fuera de rango de Perú: lat=${data.lat}, lng=${data.lng}`);
                    socket.emit('error', { message: 'Coordenadas fuera del rango permitido' });
                    return;
                }
                // 3. Verificar JWT del conductor
                if (!data.token) {
                    socket.emit('error', { message: 'Se requiere token de autenticación para emitir ubicación' });
                    return;
                }
                let payload;
                try {
                    payload = jsonwebtoken_1.default.verify(data.token, JWT_SECRET);
                }
                catch {
                    socket.emit('error', { message: 'Token inválido o expirado' });
                    return;
                }
                // 4. Verificar que el usuario tiene rol de DRIVER o ADMIN
                if (payload.role !== UserEntity_1.UserRole.DRIVER && payload.role !== UserEntity_1.UserRole.ADMIN && payload.role !== UserEntity_1.UserRole.SUPER_ADMIN) {
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
                logger_1.logger.info(`[Socket] GPS actualizado: tripId=${data.tripId} | lat=${data.lat} | lng=${data.lng} | driver=${payload.email}`);
            });
            socket.on('disconnect', () => {
                logger_1.logger.info(`[Socket] Cliente desconectado: ${socket.id}`);
            });
            socket.on('error', (err) => {
                logger_1.logger.error(`[Socket] Error en socket ${socket.id}:`, { message: err.message });
            });
        });
    }
}
exports.LocationGateway = LocationGateway;
//# sourceMappingURL=LocationGateway.js.map