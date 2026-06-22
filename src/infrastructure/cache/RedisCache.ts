import Redis from 'ioredis';
import { logger } from '../logger';

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
    private store = new Map<string, { value: string; expiresAt: number }>();

    async get(key: string): Promise<string | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    async set(key: string, value: string, mode?: string, ttl?: number): Promise<void> {
        const expiresAt = ttl ? Date.now() + ttl * 1000 : Date.now() + 3600 * 1000;
        this.store.set(key, { value, expiresAt });
    }

    async del(key: string): Promise<void> {
        this.store.delete(key);
    }

    async keys(pattern: string): Promise<string[]> {
        const prefix = pattern.replace('*', '');
        return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
    }

    async flushall(): Promise<void> {
        this.store.clear();
    }
}

class CacheService {
    private client: Redis | InMemoryFallback;
    private isRedis: boolean = false;

    constructor() {
        if (REDIS_URL) {
            try {
                const redis = new Redis(REDIS_URL, {
                    maxRetriesPerRequest: 3,
                    lazyConnect: true,
                    connectTimeout: 5000,
                });

                redis.on('connect', () => {
                    logger.info('[Cache] Redis conectado exitosamente');
                    this.isRedis = true;
                });

                redis.on('error', (err) => {
                    logger.warn(`[Cache] Error de Redis: ${err.message}. Usando caché en memoria.`);
                    this.isRedis = false;
                });

                this.client = redis;
            } catch (err) {
                logger.warn('[Cache] No se pudo conectar a Redis. Usando caché en memoria.');
                this.client = new InMemoryFallback();
            }
        } else {
            logger.info('[Cache] REDIS_URL no configurada. Usando caché en memoria (solo para desarrollo).');
            this.client = new InMemoryFallback();
        }
    }

    /**
     * Obtener un valor del caché.
     * Retorna null si no existe o expiró.
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.client.get(key);
            if (!value) return null;
            return JSON.parse(value) as T;
        } catch (err: any) {
            logger.warn(`[Cache] Error al leer clave ${key}: ${err.message}`);
            return null;
        }
    }

    /**
     * Guardar un valor en el caché con TTL en segundos.
     */
    async set(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
        try {
            const serialized = JSON.stringify(value);
            if (this.client instanceof InMemoryFallback) {
                await this.client.set(key, serialized, 'EX', ttlSeconds);
            } else {
                await (this.client as Redis).set(key, serialized, 'EX', ttlSeconds);
            }
        } catch (err: any) {
            logger.warn(`[Cache] Error al escribir clave ${key}: ${err.message}`);
        }
    }

    /**
     * Eliminar una clave del caché.
     */
    async del(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch (err: any) {
            logger.warn(`[Cache] Error al eliminar clave ${key}: ${err.message}`);
        }
    }

    /**
     * Invalidar todas las claves que coincidan con un patrón.
     * Útil para invalidar el caché de búsquedas cuando se crea un nuevo viaje.
     */
    async invalidatePattern(pattern: string): Promise<void> {
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await Promise.all(keys.map(k => this.client.del(k)));
                logger.info(`[Cache] Invalidadas ${keys.length} claves con patrón: ${pattern}`);
            }
        } catch (err: any) {
            logger.warn(`[Cache] Error al invalidar patrón ${pattern}: ${err.message}`);
        }
    }

    /**
     * Helper: obtener del caché o ejecutar la función y cachear el resultado.
     * Patrón "cache-aside" (lazy loading).
     */
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        ttlSeconds: number = 300
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            logger.info(`[Cache] HIT: ${key}`);
            return cached;
        }

        logger.info(`[Cache] MISS: ${key} — consultando BD`);
        const value = await fetchFn();
        await this.set(key, value, ttlSeconds);
        return value;
    }

    get isConnectedToRedis(): boolean {
        return this.isRedis;
    }
}

// Singleton — una sola instancia en toda la aplicación
export const cache = new CacheService();

// ─── Claves de caché estandarizadas ──────────────────────────────────────────

export const CacheKeys = {
    // Búsqueda de viajes: trips:search:Lima:Cusco:2026-07-15:1:15
    tripSearch: (origin: string, destination: string, date: string, page: number, limit: number) =>
        `trips:search:${origin}:${destination}:${date}:${page}:${limit}`,

    // Todos los viajes de una ruta
    tripsByRoute: (routeId: string) => `trips:route:${routeId}`,

    // Detalle de un viaje
    tripDetail: (tripId: string) => `trips:detail:${tripId}`,

    // Rutas de una empresa
    companyRoutes: (companyId: string) => `routes:company:${companyId}`,

    // Perfil de empresa
    companyProfile: (companyId: string) => `company:${companyId}`,

    // Patrón para invalidar todas las búsquedas de viajes
    allTripSearches: () => 'trips:search:*',

    // Patrón para invalidar viajes de una ruta específica
    routeTrips: (routeId: string) => `trips:route:${routeId}*`,
};

// TTL en segundos para cada tipo de dato
export const CacheTTL = {
    TRIP_SEARCH: 5 * 60,        // 5 minutos — búsquedas de viajes
    TRIP_DETAIL: 2 * 60,        // 2 minutos — detalle de viaje (cambia con reservas)
    COMPANY_ROUTES: 60 * 60,    // 1 hora — rutas de empresa (cambian poco)
    COMPANY_PROFILE: 30 * 60,   // 30 minutos — perfil de empresa
};
