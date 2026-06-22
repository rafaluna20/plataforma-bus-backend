"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheTTL = exports.CacheKeys = exports.cache = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../logger");
/**
 * Servicio de caché con Redis
 *
 * Usado para:
 * - Cachear resultados de búsqueda de viajes (TTL: 5 minutos)
 * - Cachear rutas y waypoints (TTL: 1 hora)
 * - Cachear perfiles de empresa (TTL: 30 minutos)
 *
 * En desarrollo sin Redis: usa un Map en memoria como fallback.
 */
const REDIS_URL = process.env.REDIS_URL || '';
class InMemoryFallback {
    constructor() {
        this.store = new Map();
    }
    async get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, mode, ttl) {
        const expiresAt = ttl ? Date.now() + ttl * 1000 : Date.now() + 3600 * 1000;
        this.store.set(key, { value, expiresAt });
    }
    async del(key) {
        this.store.delete(key);
    }
    async keys(pattern) {
        const prefix = pattern.replace('*', '');
        return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
    }
    async flushall() {
        this.store.clear();
    }
}
class CacheService {
    constructor() {
        this.isRedis = false;
        if (REDIS_URL) {
            try {
                const redis = new ioredis_1.default(REDIS_URL, {
                    maxRetriesPerRequest: 3,
                    lazyConnect: true,
                    connectTimeout: 5000,
                });
                redis.on('connect', () => {
                    logger_1.logger.info('[Cache] Redis conectado exitosamente');
                    this.isRedis = true;
                });
                redis.on('error', (err) => {
                    logger_1.logger.warn(`[Cache] Error de Redis: ${err.message}. Usando caché en memoria.`);
                    this.isRedis = false;
                });
                this.client = redis;
            }
            catch (err) {
                logger_1.logger.warn('[Cache] No se pudo conectar a Redis. Usando caché en memoria.');
                this.client = new InMemoryFallback();
            }
        }
        else {
            logger_1.logger.info('[Cache] REDIS_URL no configurada. Usando caché en memoria (solo para desarrollo).');
            this.client = new InMemoryFallback();
        }
    }
    /**
     * Obtener un valor del caché.
     * Retorna null si no existe o expiró.
     */
    async get(key) {
        try {
            const value = await this.client.get(key);
            if (!value)
                return null;
            return JSON.parse(value);
        }
        catch (err) {
            logger_1.logger.warn(`[Cache] Error al leer clave ${key}: ${err.message}`);
            return null;
        }
    }
    /**
     * Guardar un valor en el caché con TTL en segundos.
     */
    async set(key, value, ttlSeconds = 300) {
        try {
            const serialized = JSON.stringify(value);
            if (this.client instanceof InMemoryFallback) {
                await this.client.set(key, serialized, 'EX', ttlSeconds);
            }
            else {
                await this.client.set(key, serialized, 'EX', ttlSeconds);
            }
        }
        catch (err) {
            logger_1.logger.warn(`[Cache] Error al escribir clave ${key}: ${err.message}`);
        }
    }
    /**
     * Eliminar una clave del caché.
     */
    async del(key) {
        try {
            await this.client.del(key);
        }
        catch (err) {
            logger_1.logger.warn(`[Cache] Error al eliminar clave ${key}: ${err.message}`);
        }
    }
    /**
     * Invalidar todas las claves que coincidan con un patrón.
     * Útil para invalidar el caché de búsquedas cuando se crea un nuevo viaje.
     */
    async invalidatePattern(pattern) {
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await Promise.all(keys.map(k => this.client.del(k)));
                logger_1.logger.info(`[Cache] Invalidadas ${keys.length} claves con patrón: ${pattern}`);
            }
        }
        catch (err) {
            logger_1.logger.warn(`[Cache] Error al invalidar patrón ${pattern}: ${err.message}`);
        }
    }
    /**
     * Helper: obtener del caché o ejecutar la función y cachear el resultado.
     * Patrón "cache-aside" (lazy loading).
     */
    async getOrSet(key, fetchFn, ttlSeconds = 300) {
        const cached = await this.get(key);
        if (cached !== null) {
            logger_1.logger.info(`[Cache] HIT: ${key}`);
            return cached;
        }
        logger_1.logger.info(`[Cache] MISS: ${key} — consultando BD`);
        const value = await fetchFn();
        await this.set(key, value, ttlSeconds);
        return value;
    }
    get isConnectedToRedis() {
        return this.isRedis;
    }
}
// Singleton — una sola instancia en toda la aplicación
exports.cache = new CacheService();
// ─── Claves de caché estandarizadas ──────────────────────────────────────────
exports.CacheKeys = {
    // Búsqueda de viajes: trips:search:Lima:Cusco:2026-07-15:1:15
    tripSearch: (origin, destination, date, page, limit) => `trips:search:${origin}:${destination}:${date}:${page}:${limit}`,
    // Todos los viajes de una ruta
    tripsByRoute: (routeId) => `trips:route:${routeId}`,
    // Detalle de un viaje
    tripDetail: (tripId) => `trips:detail:${tripId}`,
    // Rutas de una empresa
    companyRoutes: (companyId) => `routes:company:${companyId}`,
    // Perfil de empresa
    companyProfile: (companyId) => `company:${companyId}`,
    // Patrón para invalidar todas las búsquedas de viajes
    allTripSearches: () => 'trips:search:*',
    // Patrón para invalidar viajes de una ruta específica
    routeTrips: (routeId) => `trips:route:${routeId}*`,
};
// TTL en segundos para cada tipo de dato
exports.CacheTTL = {
    TRIP_SEARCH: 5 * 60, // 5 minutos — búsquedas de viajes
    TRIP_DETAIL: 2 * 60, // 2 minutos — detalle de viaje (cambia con reservas)
    COMPANY_ROUTES: 60 * 60, // 1 hora — rutas de empresa (cambian poco)
    COMPANY_PROFILE: 30 * 60, // 30 minutos — perfil de empresa
};
//# sourceMappingURL=RedisCache.js.map