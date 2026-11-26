import { performance } from 'node:perf_hooks'
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'
import variant from '@jitl/quickjs-singlefile-cjs-release-sync'

let engine
const maxResult = 56_000

// Each invocation has a fresh WebAssembly VM. No host functions, loaders,
// environment, filesystem or network capabilities are supplied to it.
export async function runAnalysisCode(code, sources, { timeMs = 750 } = {}) {
  if (typeof code !== 'string' || !code.trim() || code.length > 14_000) throw new Error('Ugyldig analyseprogram')
  const input = JSON.stringify(sources.map(({ id, title, text }) => ({ id, title, text })))
  if (input.length > 180_000) throw new Error('For stort analysegrunnlag til kodekjøringen')
  const module = await (engine ??= newQuickJSWASMModuleFromVariant(variant))
  const runtime = module.newRuntime()
  runtime.setMemoryLimit(24 * 1024 * 1024)
  runtime.setMaxStackSize(256 * 1024)
  const until = performance.now() + timeMs
  runtime.setInterruptHandler(() => performance.now() >= until)
  const vm = runtime.newContext()
  try {
    const inputHandle = vm.newString(input)
    vm.setProp(vm.global, 'sourceJSON', inputHandle)
    inputHandle.dispose()
    const result = vm.evalCode(`"use strict";
      const data = JSON.parse(sourceJSON);
      const stringify = JSON.stringify;
      ${code}
      const resultJSON = stringify(analyze(data));
      if (typeof resultJSON !== "string" || resultJSON.length > ${maxResult}) throw new Error("Ugyldig resultat");
      resultJSON;`, 'analyse.js')
    if (result.error) {
      const detail = vm.dump(result.error)
      result.error.dispose()
      const message = detail?.message === 'interrupted' ? 'Kodekjøringen overskred tiden' : 'Analyseprogrammet leverte ikke et gyldig resultat'
      throw new Error(message)
    }
    const value = vm.getString(result.value)
    result.value.dispose()
    return JSON.parse(value)
  } finally {
    vm.dispose()
    runtime.dispose()
  }
}

export const computeInstructions = `Skriv et kort, rent JavaScript-program som definerer function analyze(sources) og returnerer JSON-kompatible data. sources er en liste med id, title og text. Hent observerte verdier fra dem. Bruk bare nødvendige operasjoner. Behold enheter, år og kilde-ID-er i resultatet. Null betyr manglende data. Bruk ingen avhengigheter og aldri nettverk, filer, klokke eller tilfeldighet. Oppgi hva programmet kontrollerer.
Returner {"code":"function analyze(sources) { ... }","method":"Kort norsk metode for brukeren"}.`
