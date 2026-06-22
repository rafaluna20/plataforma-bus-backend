"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = setupSwagger;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '🚌 Transporte Core API',
            version: '2.0.0',
            description: `
## API REST para plataforma de transporte interprovincial

### Autenticación
Todos los endpoints protegidos requieren un **Bearer Token** JWT en el header \`Authorization\`.

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

El access token se obtiene en \`POST /api/v1/auth/login\` o \`POST /api/v1/auth/register\`.
Tiene una duración de **15 minutos**. Usa \`POST /api/v1/auth/refresh\` para renovarlo.

### Roles de usuario
| Rol | Descripción |
|-----|-------------|
| \`SUPER_ADMIN\` | Acceso total al sistema |
| \`ADMIN\` | Gestión de su empresa (rutas, vehículos, viajes) |
| \`DRIVER\` | Actualizar estado de viajes y emitir GPS |
| \`PASSENGER\` | Buscar viajes y hacer reservas |
            `,
            contact: {
                name: 'Transporte Core Team',
                email: 'dev@transporte.pe',
            },
            license: {
                name: 'MIT',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Servidor de desarrollo',
            },
            {
                url: 'https://api.transporte.pe',
                description: 'Servidor de producción',
            },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Token JWT obtenido en /api/v1/auth/login',
                },
            },
            schemas: {
                // ─── Auth ─────────────────────────────────────────────────────
                RegisterRequest: {
                    type: 'object',
                    required: ['name', 'email', 'password'],
                    properties: {
                        name: { type: 'string', example: 'Juan Pérez', minLength: 2, maxLength: 150 },
                        email: { type: 'string', format: 'email', example: 'juan@example.com' },
                        password: { type: 'string', minLength: 8, example: 'MiPassword123!' },
                        docType: { type: 'string', enum: ['DNI', 'CE', 'PASAPORTE', 'RUC'], example: 'DNI' },
                        docNum: { type: 'string', example: '12345678' },
                        phone: { type: 'string', example: '987654321' },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'juan@example.com' },
                        password: { type: 'string', example: 'MiPassword123!' },
                    },
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'Sesión iniciada exitosamente' },
                        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        user: { $ref: '#/components/schemas/UserProfile' },
                    },
                },
                UserProfile: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Juan Pérez' },
                        email: { type: 'string', example: 'juan@example.com' },
                        role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'DRIVER', 'PASSENGER'] },
                        balance: { type: 'number', example: 150.00 },
                        companyId: { type: 'string', format: 'uuid', nullable: true },
                    },
                },
                // ─── Company ──────────────────────────────────────────────────
                CreateCompanyRequest: {
                    type: 'object',
                    required: ['ruc', 'tradeName', 'legalName'],
                    properties: {
                        ruc: { type: 'string', length: 11, example: '20123456789' },
                        tradeName: { type: 'string', example: 'Cruz del Sur' },
                        legalName: { type: 'string', example: 'Cruz del Sur S.A.C.' },
                        commissionRate: { type: 'number', minimum: 0, maximum: 100, example: 5.0 },
                    },
                },
                // ─── Admin ────────────────────────────────────────────────────
                CreateStaffRequest: {
                    type: 'object',
                    required: ['name', 'email', 'password', 'companyId'],
                    properties: {
                        name: { type: 'string', example: 'María García' },
                        email: { type: 'string', format: 'email', example: 'maria@empresa.com' },
                        password: { type: 'string', minLength: 8, example: 'Password123!' },
                        companyId: { type: 'string', format: 'uuid' },
                        docType: { type: 'string', enum: ['DNI', 'CE', 'PASAPORTE', 'RUC'] },
                        docNum: { type: 'string', example: '87654321' },
                        phone: { type: 'string', example: '987123456' },
                    },
                },
                UpdateRoleRequest: {
                    type: 'object',
                    required: ['role'],
                    properties: {
                        role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'DRIVER', 'PASSENGER'] },
                        companyId: { type: 'string', format: 'uuid', nullable: true },
                    },
                },
                SystemStats: {
                    type: 'object',
                    properties: {
                        totalUsers: { type: 'integer', example: 1250 },
                        activeUsers: { type: 'integer', example: 1180 },
                        totalCompanies: { type: 'integer', example: 15 },
                        byRole: {
                            type: 'object',
                            example: { PASSENGER: 1200, ADMIN: 30, DRIVER: 18, SUPER_ADMIN: 2 },
                        },
                    },
                },
                // ─── Errors ───────────────────────────────────────────────────
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Mensaje de error descriptivo' },
                    },
                },
                ValidationErrorResponse: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Datos de entrada inválidos' },
                        details: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    field: { type: 'string', example: 'email' },
                                    message: { type: 'string', example: 'Formato de correo inválido' },
                                },
                            },
                        },
                    },
                },
            },
        },
        tags: [
            { name: 'Auth', description: 'Autenticación y gestión de sesiones' },
            { name: 'Admin', description: 'Panel de administración — gestión de usuarios y roles' },
            { name: 'Companies', description: 'Gestión de empresas operadoras' },
            { name: 'Vehicles', description: 'Gestión de flota de vehículos' },
            { name: 'Routes', description: 'Gestión de rutas y paraderos' },
            { name: 'Trips', description: 'Búsqueda pública de viajes disponibles' },
            { name: 'Trip Management', description: 'Programación y gestión operativa de viajes' },
            { name: 'Bookings', description: 'Reservas de pasajeros' },
        ],
        paths: {
            // ─── AUTH ──────────────────────────────────────────────────────────
            '/api/v1/auth/register': {
                post: {
                    tags: ['Auth'],
                    summary: 'Registrar nuevo usuario',
                    description: 'Crea una cuenta nueva con rol PASSENGER por defecto.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
                    },
                    responses: {
                        201: { description: 'Cuenta creada exitosamente', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
                        400: { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
                        409: { description: 'Email ya registrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
                        429: { description: 'Demasiados intentos de registro' },
                    },
                },
            },
            '/api/v1/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Iniciar sesión',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
                    },
                    responses: {
                        200: { description: 'Sesión iniciada', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
                        401: { description: 'Credenciales inválidas' },
                        429: { description: 'Demasiados intentos de login' },
                    },
                },
            },
            '/api/v1/auth/refresh': {
                post: {
                    tags: ['Auth'],
                    summary: 'Renovar access token',
                    description: 'Usa el refresh token (cookie HttpOnly) para obtener un nuevo access token.',
                    responses: {
                        200: { description: 'Token renovado' },
                        401: { description: 'Refresh token inválido o expirado' },
                    },
                },
            },
            '/api/v1/auth/logout': {
                post: {
                    tags: ['Auth'],
                    summary: 'Cerrar sesión',
                    security: [{ BearerAuth: [] }],
                    responses: {
                        200: { description: 'Sesión cerrada exitosamente' },
                        401: { description: 'No autenticado' },
                    },
                },
            },
            '/api/v1/auth/me': {
                get: {
                    tags: ['Auth'],
                    summary: 'Obtener perfil del usuario autenticado',
                    security: [{ BearerAuth: [] }],
                    responses: {
                        200: { description: 'Perfil del usuario', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } } },
                        401: { description: 'No autenticado' },
                    },
                },
            },
            // ─── ADMIN ─────────────────────────────────────────────────────────
            '/api/v1/admin/users/admin': {
                post: {
                    tags: ['Admin'],
                    summary: 'Crear usuario ADMIN',
                    description: '**Solo SUPER_ADMIN.** Crea un administrador vinculado a una empresa.',
                    security: [{ BearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateStaffRequest' } } },
                    },
                    responses: {
                        201: { description: 'ADMIN creado exitosamente' },
                        400: { description: 'Datos inválidos' },
                        403: { description: 'Sin permisos (requiere SUPER_ADMIN)' },
                        404: { description: 'Empresa no encontrada' },
                        409: { description: 'Email ya registrado' },
                    },
                },
            },
            '/api/v1/admin/users/driver': {
                post: {
                    tags: ['Admin'],
                    summary: 'Crear usuario DRIVER (conductor)',
                    description: '**SUPER_ADMIN o ADMIN de la empresa.** Crea un conductor vinculado a una empresa.',
                    security: [{ BearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateStaffRequest' } } },
                    },
                    responses: {
                        201: { description: 'DRIVER creado exitosamente' },
                        403: { description: 'Sin permisos o empresa incorrecta' },
                        404: { description: 'Empresa no encontrada' },
                        409: { description: 'Email ya registrado' },
                    },
                },
            },
            '/api/v1/admin/users/{id}/role': {
                patch: {
                    tags: ['Admin'],
                    summary: 'Cambiar rol de usuario',
                    description: '**Solo SUPER_ADMIN.** Promueve o degrada el rol de un usuario.',
                    security: [{ BearerAuth: [] }],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateRoleRequest' } } },
                    },
                    responses: {
                        200: { description: 'Rol actualizado' },
                        403: { description: 'Sin permisos o intento de modificar SUPER_ADMIN' },
                        404: { description: 'Usuario no encontrado' },
                    },
                },
            },
            '/api/v1/admin/users/{id}/status': {
                patch: {
                    tags: ['Admin'],
                    summary: 'Activar/desactivar cuenta de usuario',
                    security: [{ BearerAuth: [] }],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['isActive'],
                                    properties: { isActive: { type: 'boolean', example: false } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Estado actualizado' },
                        403: { description: 'Sin permisos' },
                        404: { description: 'Usuario no encontrado' },
                    },
                },
            },
            '/api/v1/admin/users': {
                get: {
                    tags: ['Admin'],
                    summary: 'Listar usuarios',
                    description: 'SUPER_ADMIN ve todos. ADMIN solo ve usuarios de su empresa.',
                    security: [{ BearerAuth: [] }],
                    parameters: [
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
                        { name: 'role', in: 'query', schema: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'DRIVER', 'PASSENGER'] } },
                        { name: 'companyId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                        { name: 'search', in: 'query', schema: { type: 'string', description: 'Buscar por nombre o email' } },
                    ],
                    responses: {
                        200: { description: 'Lista paginada de usuarios' },
                        401: { description: 'No autenticado' },
                        403: { description: 'Sin permisos' },
                    },
                },
            },
            '/api/v1/admin/stats': {
                get: {
                    tags: ['Admin'],
                    summary: 'Estadísticas del sistema',
                    description: '**Solo SUPER_ADMIN.** Retorna métricas globales del sistema.',
                    security: [{ BearerAuth: [] }],
                    responses: {
                        200: { description: 'Estadísticas del sistema', content: { 'application/json': { schema: { $ref: '#/components/schemas/SystemStats' } } } },
                        403: { description: 'Sin permisos (requiere SUPER_ADMIN)' },
                    },
                },
            },
        },
    },
    apis: [], // Usamos definición inline en lugar de JSDoc
};
const swaggerSpec = (0, swagger_jsdoc_1.default)(options);
function setupSwagger(app) {
    // Servir la UI de Swagger
    app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Transporte Core API Docs',
        swaggerOptions: {
            persistAuthorization: true, // Mantener el token entre recargas
            displayRequestDuration: true,
            filter: true,
            tryItOutEnabled: true,
        },
    }));
    // Endpoint para obtener el spec en JSON (útil para Postman/Insomnia)
    app.get('/api/docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
}
//# sourceMappingURL=swagger.js.map