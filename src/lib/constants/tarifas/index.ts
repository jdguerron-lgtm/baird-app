/**
 * Tarifas — punto único de entrada.
 *
 * Doc canónico: docs/TARIFAS.md.
 *
 * Re-exporta todo lo de `mabe.ts` y `particular.ts` para que los callers
 * puedan importar desde `@/lib/constants/tarifas` directamente.
 */

export * from './mabe'
export * from './particular'
