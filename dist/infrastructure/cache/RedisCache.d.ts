declare class CacheService {
    private client;
    private isRedis;
    constructor();
    /**
     * Obtener un valor del caché.
     * Retorna null si no existe o expiró.
     */
    get<T>(key: string): Promise<T | null>;
    /**
     * Guardar un valor en el caché con TTL en segundos.
     */
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    /**
     * Eliminar una clave del caché.
     */
    del(key: string): Promise<void>;
    /**
     * Invalidar todas las claves que coincidan con un patrón.
     * Útil para invalidar el caché de búsquedas cuando se crea un nuevo viaje.
     */
    invalidatePattern(pattern: string): Promise<void>;
    /**
     * Helper: obtener del caché o ejecutar la función y cachear el resultado.
     * Patrón "cache-aside" (lazy loading).
     */
    getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    get isConnectedToRedis(): boolean;
}
export declare const cache: CacheService;
export declare const CacheKeys: {
    tripSearch: (origin: string, destination: string, date: string, page: number, limit: number) => string;
    tripsByRoute: (routeId: string) => string;
    tripDetail: (tripId: string) => string;
    companyRoutes: (companyId: string) => string;
    companyProfile: (companyId: string) => string;
    allTripSearches: () => string;
    routeTrips: (routeId: string) => string;
};
export declare const CacheTTL: {
    TRIP_SEARCH: number;
    TRIP_DETAIL: number;
    COMPANY_ROUTES: number;
    COMPANY_PROFILE: number;
};
export {};
//# sourceMappingURL=RedisCache.d.ts.map