"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSentry = initSentry;
exports.captureError = captureError;
exports.captureWarning = captureWarning;
exports.setSentryUser = setSentryUser;
exports.addBreadcrumb = addBreadcrumb;
const logger_1 = require("../logger");
// Implementación real de Sentry (se activa si está instalado y configurado)
let sentryInstance = null;
async function initSentry() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        logger_1.logger.warn('⚠️  SENTRY_DSN no configurado. El monitoreo de errores está desactivado.');
        return;
    }
    try {
        // Importación dinámica para no fallar si Sentry no está instalado
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Sentry = require('@sentry/node');
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            release: process.env.npm_package_version || '1.0.0',
            // Capturar el 100% de transacciones en desarrollo, 10% en producción
            tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
            // Ignorar errores esperados (errores de negocio, no bugs)
            ignoreErrors: [
                'Credenciales inválidas',
                'Token expirado',
                'Token inválido',
                'Acceso no autorizado',
                'Reserva no encontrada',
                'Viaje no encontrado',
            ],
            beforeSend(event) {
                // No enviar datos sensibles a Sentry
                const req = event.request;
                if (req?.data) {
                    const data = req.data;
                    if (data.password)
                        data.password = '[REDACTED]';
                    if (data.passwordHash)
                        data.passwordHash = '[REDACTED]';
                    if (data.refreshToken)
                        data.refreshToken = '[REDACTED]';
                }
                return event;
            },
        });
        sentryInstance = {
            captureException: (err, context) => Sentry.captureException(err, { extra: context }),
            captureMessage: (msg, level) => Sentry.captureMessage(msg, level),
            setUser: (user) => Sentry.setUser(user),
            addBreadcrumb: (bc) => Sentry.addBreadcrumb(bc),
        };
        logger_1.logger.info('✅ Sentry inicializado correctamente');
    }
    catch {
        logger_1.logger.warn('⚠️  No se pudo inicializar Sentry. Instala con: npm install @sentry/node');
    }
}
/**
 * Capturar un error y enviarlo a Sentry.
 * Si Sentry no está configurado, solo loguea el error.
 */
function captureError(err, context) {
    logger_1.logger.error(`[Error capturado]: ${err.message}`, { stack: err.stack, ...context });
    if (sentryInstance) {
        sentryInstance.captureException(err, context);
    }
}
/**
 * Capturar un mensaje de advertencia.
 */
function captureWarning(message) {
    logger_1.logger.warn(`[Warning capturado]: ${message}`);
    if (sentryInstance) {
        sentryInstance.captureMessage(message, 'warning');
    }
}
/**
 * Establecer el usuario actual en el contexto de Sentry.
 * Llamar después de autenticar al usuario.
 */
function setSentryUser(user) {
    if (sentryInstance) {
        sentryInstance.setUser(user);
    }
}
/**
 * Agregar un breadcrumb para trazar el flujo de la petición.
 */
function addBreadcrumb(message, category = 'app') {
    if (sentryInstance) {
        sentryInstance.addBreadcrumb({ message, category, level: 'info' });
    }
}
//# sourceMappingURL=sentry.js.map