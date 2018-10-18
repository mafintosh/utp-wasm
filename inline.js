const fs = require('fs')

const wasm = fs.readFileSync(__dirname + '/binding.wasm', 'base64')
const dataUrl = 'data:application/wasm;base64,' + wasm
const src = fs.readFileSync(__dirname + '/binding.js', 'utf-8')
  .replace(/var wasmBinaryFile = 'binding.wasm'/, `var wasmBinaryFile = ENVIRONMENT_IS_WEB ? '${dataUrl}' : 'binding.wasm'`)

fs.writeFileSync(__dirname + '/binding-inline.js', src)
