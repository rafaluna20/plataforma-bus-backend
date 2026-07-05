// Se ejecuta antes de que Jest cargue cualquier archivo de test (ver
// `setupFiles` en jest.config.js) — a diferencia de asignar estas variables
// dentro de un archivo de test, esto garantiza que ya existan en process.env
// ANTES de que se evalúen los `import` de los módulos bajo prueba (los
// `import` se "hoistean" al inicio del archivo, así que asignarlas después
// del import no sirve: el módulo ya capturó el valor anterior).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-unit-tests';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
