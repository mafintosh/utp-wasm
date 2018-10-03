const utp = require('./')

const sock = utp()

sock.listen(20000)
sock.on('close', function () {
  console.log('everything is closed')
})

sock.on('connection', function (socket) {
  console.log('new connection')
  socket.on('data', function (data) {
    socket.write(data)
  })
  socket.on('end', function () {
    console.log('(end-of-stream)')
  })
  socket.on('close', function () {
    console.log('(fully closed)')
  })
})

const s = sock.connect(20000, '127.0.0.1')

s.on('connect', () => console.log('(on-connect)'))
s.write('hi')
s.write('ho')
s.on('data', console.log)
