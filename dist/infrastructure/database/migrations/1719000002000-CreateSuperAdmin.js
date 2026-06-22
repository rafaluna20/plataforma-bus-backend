"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateSuperAdmin1719000002000 = void 0;
const bcrypt = __importStar(require("bcryptjs"));
/**
 * Migración: Crear el primer usuario SUPER_ADMIN del sistema.
 *
 * ⚠️ IMPORTANTE: Cambiar la contraseña inmediatamente después de ejecutar esta migración.
 * Ejecutar: npm run typeorm migration:run
 *
 * Credenciales iniciales:
 *   Email:    superadmin@transporte.pe
 *   Password: Admin@2026! (CAMBIAR EN PRODUCCIÓN)
 */
class CreateSuperAdmin1719000002000 {
    constructor() {
        this.name = 'CreateSuperAdmin1719000002000';
    }
    async up(queryRunner) {
        // Verificar si ya existe un SUPER_ADMIN para evitar duplicados
        const existing = await queryRunner.query(`SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`);
        if (existing.length > 0) {
            console.log('⚠️  Ya existe un SUPER_ADMIN. Saltando migración.');
            return;
        }
        const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@2026!';
        const passwordHash = await bcrypt.hash(password, 12);
        await queryRunner.query(`
            INSERT INTO users (
                id,
                name,
                email,
                password_hash,
                role,
                balance,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                'Super Administrador',
                'superadmin@transporte.pe',
                '${passwordHash}',
                'SUPER_ADMIN',
                0.00,
                true,
                NOW(),
                NOW()
            )
        `);
        console.log('✅ SUPER_ADMIN creado: superadmin@transporte.pe');
        console.log('⚠️  CAMBIAR LA CONTRASEÑA INMEDIATAMENTE EN PRODUCCIÓN');
    }
    async down(queryRunner) {
        await queryRunner.query(`DELETE FROM users WHERE email = 'superadmin@transporte.pe' AND role = 'SUPER_ADMIN'`);
        console.log('🗑️  SUPER_ADMIN eliminado');
    }
}
exports.CreateSuperAdmin1719000002000 = CreateSuperAdmin1719000002000;
//# sourceMappingURL=1719000002000-CreateSuperAdmin.js.map