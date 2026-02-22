module.exports = {
  displayName: 'gateway',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/gateway',
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/**/*.e2e-spec.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
  ],
  moduleNameMapper: {
    '^@tesseract/types$': '<rootDir>/../../packages/types/src',
    '^@tesseract/database$': '<rootDir>/../../packages/database/src',
  },
  // Configuración para tests e2e - evita que Jest se quede colgado
  detectOpenHandles: true,  // Detecta conexiones abiertas (útil para debugging)
  forceExit: true,          // Fuerza el cierre después de completar los tests
  maxWorkers: 1,            // Un solo worker para tests e2e (evita conflictos de BD)
};
