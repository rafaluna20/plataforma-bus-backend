import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './presentation/app';
import { AppDataSource } from './infrastructure/database/data-source';
import { LocationGateway } from './infrastructure/sockets/LocationGateway';
import { logger } from './infrastructure/logger';

const PORT = process.env.PORT || 3001;

const startServer = async () => {
    try {
        // 1. Inicializar la conexión a la Base de Datos con TypeORM
        await AppDataSource.initialize();
        logger.info('✅ Base de Datos (PostgreSQL) inicializada correctamente');

        // 2. Crear servidor HTTP envuelto alrededor de Express
        const server = http.createServer(app);

        // 3. Inicializar Socket.io para el rastreo de vehículos en vivo
        const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3002').split(',');
        const io = new SocketIOServer(server, {
            cors: {
                origin: allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        // Configurar Gateway de Ubicaciones GPS (con autenticación)
        new LocationGateway(io);

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
        process.exit(1);
    }
};

startServer();
