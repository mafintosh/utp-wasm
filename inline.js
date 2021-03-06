const fs = require('fs')

const wasm = fs.readFileSync(__dirname + '/binding.wasm', 'base64')
const dataUrl = 'data:application/octet-stream;base64,' + wasm
const src = fs.readFileSync(__dirname + '/binding.js', 'utf-8')
  .replace(/var wasmBinaryFile = 'binding.wasm'/, `var wasmBinaryFile = '${dataUrl}'`)
  .replace(`require('fs')`, '{}')

fs.writeFileSync(__dirname + '/binding-inline.js', src)
