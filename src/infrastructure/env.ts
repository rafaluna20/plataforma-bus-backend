/**
 * Ayudante único para distinguir "desarrollo local" de "cualquier entorno
 * desplegado" (staging, producción, o lo que sea).
 *
 * NODE_ENV se deja deliberadamente binario (development/production) — Express
 * y varias librerías tienen comportamiento propio ligado al string exacto
 * 'production' (páginas de error, cacheo de vistas, etc.), así que un tercer
 * valor tipo NODE_ENV=staging las confundiría. La convención correcta es
 * poner NODE_ENV=production tanto en staging como en producción, y usar
 * APP_ENV (ver server.ts / sentry.ts) solo como etiqueta informativa para
 * distinguirlos en logs/Sentry.
 *
 * Todos los checks de seguridad de este proyecto (synchronize, cookies
 * secure, CORS laxo para localhost, secretos por defecto) deben usar
 * `isDevelopment` como el único caso permisivo, en vez de comparar
 * `NODE_ENV !== 'production'` — así, si alguien pone por error
 * NODE_ENV=staging (un error fácil de cometer), el sistema falla hacia el
 * lado seguro (tratado como producción) en vez de hacia el lado relajado.
 */
export const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

/**
 * Etiqueta informativa del nivel de despliegue (development / staging /
 * production), para logs y Sentry — separada de NODE_ENV a propósito (ver
 * arriba). Definir APP_ENV=staging en ese entorno; si no se define, cae a
 * NODE_ENV (development en local, production en cualquier despliegue).
 */
export const deployEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
