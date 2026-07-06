import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

// ─── Validación de variables de entorno críticas ──────────────────────────────
const requiredEnvVars = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(`❌ Variables de entorno faltantes en producción: ${missingVars.join(', ')}`);
    process.exit(1);
}

if (missingVars.length > 0) {
    console.warn(`⚠️  Variables de entorno no configuradas (usando defaults de desarrollo): ${missingVars.join(', ')}`);
}

// ─── Validación de secretos JWT ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_THIS_SECRET_IN_PRODUCTION') {
        console.error('❌ JWT_SECRET no configurado o usa el valor por defecto. Configura un secreto seguro en producción.');
        process.exit(1);
    }
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'CHANGE_THIS_REFRESH_SECRET_IN_PRODUCTION') {
        console.error('❌ JWT_REFRESH_SECRET no configurado o usa el valor por defecto.');
        process.exit(1);
    }
}

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'dev_password_only',
    database: process.env.DB_NAME || 'transporte_db',
    // ⚠️ NUNCA usar synchronize:true en producción — puede destruir el esquema
    // Usar migraciones: npm run migration:generate / migration:run
    synchronize: process.env.NODE_ENV !== 'production',
    // Opt-in explícito, no automático por NODE_ENV: muchos Postgres gestionados
    // (Render, Railway, Supabase, RDS) exigen TLS con certificados fuera de la
    // cadena de confianza por defecto de Node (de ahí rejectUnauthorized:false
    // si DB_SSL=true), pero un Postgres autoalojado sin TLS configurado
    // (ej. detrás de Coolify/Docker en una VPS propia) rompe la conexión si se
    // le fuerza SSL. Activar con DB_SSL=true solo cuando el servidor lo soporte.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    // Aplica automáticamente cualquier migración pendiente al arrancar el
    // servidor (AppDataSource.initialize()), antes de aceptar requests — así
    // no depende de que alguien recuerde correr `migration:run` a mano antes
    // de cada deploy con cambios de esquema.
    migrationsRun: true,
    logging: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
    // El segundo patrón recoge entities de módulos ya extraídos a src/modules/*/domain/
    // (ver src/modules/parcels como piloto de monolito modular).
    entities: [__dirname + '/entities/*.{js,ts}', __dirname + '/../../modules/*/domain/*.{js,ts}'],
    migrations: [__dirname + '/migrations/*.{js,ts}'],
    subscribers: [],
    /**
     * Pool de conexiones con keep-alive para evitar "Connection terminated unexpectedly".
     * 
     * El error ocurre cuando PostgreSQL cierra conexiones idle después de un tiempo
     * (por defecto tcp_keepalives_idle en el servidor). La solución es:
     * 1. keepAlive: true — envía paquetes TCP keep-alive para mantener la conexión viva
     * 2. keepAliveInitialDelayMillis — tiempo antes del primer keep-alive (10 segundos)
     * 3. connectionTimeoutMillis — timeout para obtener una conexión del pool
     * 4. idleTimeoutMillis — tiempo antes de cerrar una conexión idle del pool
     *    (debe ser MENOR que el timeout del servidor PostgreSQL)
     */
    extra: {
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        // Keep-alive para evitar "Connection terminated unexpectedly"
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // Timeout para obtener conexión del pool (30 segundos)
        connectionTimeoutMillis: 30000,
        // Cerrar conexiones idle después de 20 segundos
        // (menor que el timeout típico de PostgreSQL de 30s)
        idleTimeoutMillis: 20000,
    },
});
