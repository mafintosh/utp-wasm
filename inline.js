const fs = require('fs')

const src = `
module.exports = Module

Module.read = function (filename, binary) {
  return Buffer.from(${JSON.stringify(fs.readFileSync(__dirname + '/binding.wasm', 'base64'))}, 'base64')
}

Module.readBinary = function (filename) {
  return Module.read(filename, true)
}

Module.arguments = []

if (typeof process !== 'undefined' && process.on) {
  process.on('uncaughtException', function (ex) {
    if (!(ex instanceof ExitStatus)) throw ex
  })
}

Module.quit = function (status) {
  if (typeof process !== 'undefined' && process.exit) process.exit(status)
}
`

const lines = fs.readFileSync(__dirname + '/binding.js', 'utf-8')
  .split('\n')

fs.writeFileSync(__dirname + '/binding-inline.js',
  lines.slice(0, 68).join('\n') + '\n' +
  src +
  lines.slice(210).join('\n') + '\n'
)
