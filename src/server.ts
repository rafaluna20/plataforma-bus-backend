import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './presentation/app';
import { AppDataSource } from './infrastructure/database/data-source';
import { LocationGateway } from './infrastructure/sockets/LocationGateway';
import { setSocketServer } from './infrastructure/sockets/SocketBus';
import { logger } from './infrastructure/logger';
import { initSentry, captureError } from './infrastructure/monitoring/sentry';

const PORT = process.env.PORT || 3001;

const startServer = async () => {
    try {
        // 0. Inicializar Sentry lo antes posible para capturar cualquier error
        // durante el propio arranque (conexión a BD, sockets, etc.)
        await initSentry();

        // 1. Inicializar la conexión a la Base de Datos con TypeORM
        await AppDataSource.initialize();
        logger.info('✅ Base de Datos (PostgreSQL) inicializada correctamente');

        // 2. Crear servidor HTTP envuelto alrededor de Express
        const server = http.createServer(app);

        // 3. Inicializar Socket.io para el rastreo de vehículos en vivo
        // Nota: "*" como origin literal en un array no funciona como comodín para
        // socket.io/cors (compara el string exacto), y tampoco es válido junto con
        // credentials:true. Si CORS_ORIGIN="*", usamos origin:true (refleja el
        // origen real de cada request), que sí es compatible con credentials:true.
        const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:3002';
        const allowedOrigins = corsOriginEnv.split(',').map(o => o.trim());
        const io = new SocketIOServer(server, {
            cors: {
                origin: allowedOrigins.includes('*') ? true : allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        // Configurar Gateway de Ubicaciones GPS (con autenticación)
        new LocationGateway(io);

        // Exponer la instancia de Socket.io a la capa de aplicación (p.ej. avisos de
        // cambio de estado de viaje) sin acoplarla a los detalles de LocationGateway.
        setSocketServer(io);

        // 4. Levantar el servidor
        server.listen(PORT, () => {
            logger.info(`🚀 Servidor corriendo en el puerto ${PORT}`);
            logger.info(`🌍 Health Check: http://localhost:${PORT}/health`);
            logger.info(`🔐 Auth API: http://localhost:${PORT}/api/v1/auth`);
            logger.info(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
        });

        // 5. Manejo graceful de señales de cierre
        const gracefulShutdown = async (signal: string) => {
            logger.info(`📴 Señal ${signal} recibida. Cerrando servidor...`);
            server.close(async () => {
                logger.info('🔌 Servidor HTTP cerrado');
                await AppDataSource.destroy();
                logger.info('🗄️ Conexión a BD cerrada');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        logger.error('❌ Error fatal al iniciar el servidor:', { error });
        captureError(error instanceof Error ? error : new Error(String(error)), { phase: 'startup' });
        process.exit(1);
    }
};

startServer();
