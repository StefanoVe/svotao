export default {
  displayName: 'svotao-share-api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'commonjs',
          types: ['node', 'jest'],
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@svotao/interfaces$': '<rootDir>/../../interfaces/src/index.ts',
  },
};
