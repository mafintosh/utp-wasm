# utp-wasm

An emscripten WASM build of libutp, as an alternative
to utp-native when you are in an enviroment where you cannot load
a native extension

NOTE: This is much slower than the native binding

## Usage

```js
const utp = require('utp-wasm')

const sock = utp()

sock.on('connection', function (connection) {
  // a simple echo server
  connection.pipe(connection)
})

sock.listen(20000)
```

## License

MIT
