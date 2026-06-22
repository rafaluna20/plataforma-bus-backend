import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['**/__tests__/**/*.test.ts', '**/*.spec.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/server.ts',
        '!src/**/*.d.ts',
        '!src/infrastructure/database/migrations/**',
    ],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterFramework: [],
    // Aumentar timeout para tests de integración
    testTimeout: 15000,
    // Variables de entorno para tests
    testEnvironmentOptions: {},
    globals: {
        'ts-jest': {
            tsconfig: {
                strict: false,
            },
        },
    },
};

export default config;
