const utp = require('./')

const sock = utp()

sock.listen(20000)
sock.on('close', function () {
  console.log('everything is closed')
})

sock.on('connection', function (socket) {
  console.log('new connection')
  socket.once('data', function (data) {
    socket.write(data)
    socket.destroy()
  })
  socket.on('end', function () {
    console.log('(end-of-stream)')
  })
  socket.on('close', function () {
    console.log('(fully closed)')
  })
})

setTimeout(function () {
  console.log('closing socket')
  sock.close()
}, 5000)
