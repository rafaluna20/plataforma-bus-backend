"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app_1 = __importDefault(require("./presentation/app"));
const data_source_1 = require("./infrastructure/database/data-source");
const LocationGateway_1 = require("./infrastructure/sockets/LocationGateway");
const logger_1 = require("./infrastructure/logger");
const PORT = process.env.PORT || 3001;
const startServer = async () => {
    try {
        // 1. Inicializar la conexión a la Base de Datos con TypeORM
        await data_source_1.AppDataSource.initialize();
        logger_1.logger.info('✅ Base de Datos (PostgreSQL) inicializada correctamente');
        // 2. Crear servidor HTTP envuelto alrededor de Express
        const server = http_1.default.createServer(app_1.default);
        // 3. Inicializar Socket.io para el rastreo de vehículos en vivo
        const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3002').split(',');
        const io = new socket_io_1.Server(server, {
            cors: {
                origin: allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });
        // Configurar Gateway de Ubicaciones GPS (con autenticación)
        new LocationGateway_1.LocationGateway(io);
        // 4. Levantar el servidor
        server.listen(PORT, () => {
            logger_1.logger.info(`🚀 Servidor corriendo en el puerto ${PORT}`);
            logger_1.logger.info(`🌍 Health Check: http://localhost:${PORT}/health`);
            logger_1.logger.info(`🔐 Auth API: http://localhost:${PORT}/api/v1/auth`);
            logger_1.logger.info(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
        });
        // 5. Manejo graceful de señales de cierre
        const gracefulShutdown = async (signal) => {
            logger_1.logger.info(`📴 Señal ${signal} recibida. Cerrando servidor...`);
            server.close(async () => {
                logger_1.logger.info('🔌 Servidor HTTP cerrado');
                await data_source_1.AppDataSource.destroy();
                logger_1.logger.info('🗄️ Conexión a BD cerrada');
                process.exit(0);
            });
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
    catch (error) {
        logger_1.logger.error('❌ Error fatal al iniciar el servidor:', { error });
        process.exit(1);
    }
};
startServer();
//# sourceMappingURL=server.js.map