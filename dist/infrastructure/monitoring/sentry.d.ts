/**
 * Configuración de Sentry para monitoreo de errores en producción.
 *
 * Para activar Sentry, instalar:
 *   npm install @sentry/node
 *
 * Variables de entorno requeridas:
 *   SENTRY_DSN=https://xxx@sentry.io/xxx
 *   NODE_ENV=production
 */
export declare function initSentry(): Promise<void>;
/**
 * Capturar un error y enviarlo a Sentry.
 * Si Sentry no está configurado, solo loguea el error.
 */
export declare function captureError(err: Error, context?: Record<string, unknown>): void;
/**
 * Capturar un mensaje de advertencia.
 */
export declare function captureWarning(message: string): void;
/**
 * Establecer el usuario actual en el contexto de Sentry.
 * Llamar después de autenticar al usuario.
 */
export declare function setSentryUser(user: {
    id: string;
    email?: string;
    role?: string;
} | null): void;
/**
 * Agregar un breadcrumb para trazar el flujo de la petición.
 */
export declare function addBreadcrumb(message: string, category?: string): void;
//# sourceMappingURL=sentry.d.ts.map