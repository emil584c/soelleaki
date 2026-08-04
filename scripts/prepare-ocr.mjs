/*
  Samler fotolæserens filer i public/ocr/ — uden netværk.

  tesseract.js henter som standard sin worker, wasm-kerne og sprogmodel fra
  jsDelivr under kørsel. Det ville være appens eneste skjulte tredjeparts-
  forespørgsel og ville bryde løftet om at alt kommer fra eget domæne.
  Derfor kopieres præcis de filer workeren ellers ville hente fra CDN, fra
  node_modules og ind i public/, så de serveres fra os selv:

    ocr/worker.min.js                          selve workeren
    ocr/tesseract-core-*-lstm.wasm.js          wasm-kernen (workeren vælger
                                               selv SIMD-variant på enheden)
    ocr/lang/dan.traineddata.gz                dansk sprogmodel, samme
                                               "4.0.0_best_int" som tesseract.js
                                               selv ville have valgt fra CDN

  Mappen er gitignoreret og genskabes af predev/prebuild. Kilden er
  node_modules, så resultatet følger package-lock.json — samme version hver
  gang, uden netværk.
*/

import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'ocr');

const from = (pkg, ...rest) => join(dirname(require.resolve(`${pkg}/package.json`)), ...rest);

const FILES = [
  [from('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  // Kun LSTM-varianterne: appen kører altid OEM 1 (LSTM_ONLY), så de gamle
  // "legacy"-kerner ville bare fylde. Workeren prøver relaxedsimd → simd →
  // basis, alt efter hvad enhedens WebAssembly kan.
  [from('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [from('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [from('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [from('@tesseract.js-data/dan', '4.0.0_best_int', 'dan.traineddata.gz'), join('lang', 'dan.traineddata.gz')],
];

mkdirSync(join(OUT, 'lang'), { recursive: true });

for (const [src, dest] of FILES) {
  copyFileSync(src, join(OUT, dest));
  console.log(`kopierede ${dest}`);
}
