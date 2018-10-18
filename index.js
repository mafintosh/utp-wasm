const stream = require('stream')
const events = require('events')
const dgram = require('dgram')
const em = require('./binding-inline')

const allocated = global._utp_allocated || []
let ready = []

global._utp_allocated = allocated

global._utp_on_accept = function (id, socket) {
  const sock = allocated[id]
  if (sock) return sock._onaccept(socket)
  return 0
}

global._utp_sendto = function (id, ptr, len, ip, port) {
  const sock = allocated[id]
  if (sock) {
    const buf = new Uint8Array(sock._heap, ptr, len)
    sock.socket.send(buf, 0, buf.length, port, intToIp(ip))
  }
}

global._utp_on_read = function (id, socketId, ptr, len) {
  const sock = allocated[id]
  if (sock) {
    const socket = sock._sockets[socketId]
    if (socket) {
      const buf = Buffer.from(sock._heap, ptr, len)
      const cpy = Buffer.allocUnsafe(buf.length)
      buf.copy(cpy)
      socket.push(cpy)
    }
  }
}

global._utp_on_eof = function (id, socketId) {
  const sock = allocated[id]
  if (sock) {
    const socket = sock._sockets[socketId]
    if (socket) {
      socket.push(null)
      socket._destroyMaybe()
    }
  }
}

global._utp_on_writable = function (id, socketId) {
  const sock = allocated[id]
  if (sock) {
    const socket = sock._sockets[socketId]
    if (socket) socket._ondrain()
  }
}

global._utp_on_destroying = function (id, socketId) {
  const sock = allocated[id]
  if (sock) {
    const socket = sock._sockets[socketId]
    if (socket) socket._ondestroy()
  }
}

global._utp_on_connect = function (id, socketId) {
  const sock = allocated[id]
  if (sock) {
    const socket = sock._sockets[socketId]
    if (socket) socket._onconnect()
  }
}

module.exports = (opts) => new UTP(opts)

class Socket extends stream.Duplex {
  constructor (utp) {
    super()

    this.destroyed = false

    let id = utp._sockets.indexOf(null)
    if (id === -1) {
      id = utp._sockets.push(this) - 1
    } else {
      utp._sockets[id] = this
    }

    this._utp = utp
    this._ptr = 0
    this._id = id
    this._vec = 0
    this._remainder = null
    this._callback = null
    this._allowOpen = 2
    this._error = null
    this._connected = false

    this.on('end', this._shutdown)
  }

  _read () {}

  _write (data, enc, cb) {
    if (this.destroyed) return

    if (!this._connected) {
      this._remainder = data
      this._callback = cb
      return
    }

    if (!this._vec) this._vec = em._malloc(em._sizeof_iovec())

    const len = data.length
    const ptr = em._malloc(len)
    em.HEAP8.set(data, ptr)
    const sent = em._write_utp(this._ptr, this._vec, ptr, len)
    em._free(ptr)

    if (sent === len) return cb()

    const rem = data.slice(sent)
    this._remainder = rem
    this._callback = cb
  }

  _shutdown () {
    em._shutdown_utp(this._ptr)
    this._destroyMaybe()
  }

  _destroyMaybe () {
    if (this._allowOpen && !--this._allowOpen) this.destroy()
  }

  _onconnect () {
    this.emit('connect')
    this._connected = true
    if (this._remainder) this._ondrain()
  }

  destroy (err) {
    if (this.destroyed) return
    this.destroyed = true

    if (err) this._error = err

    if (!this._ptr) this._ondestroy()
    else em._close_socket(this._ptr)
  }

  _ondestroy () {
    if (this._vec) em._free(this._vec)

    const sockets = this._utp._sockets
    sockets[this._id] = null
    while (sockets.length && !sockets[sockets.length - 1]) {
      sockets.pop()
    }
    this._utp._closeMaybe()
    if (this._error) this.emit('error', this._error)
    this.emit('close')
  }

  _ondrain () {
    if (!this._callback) return
    const cb = this._callback
    const data = this._remainder
    this._callback = this._remainder = null
    this._write(data, null, cb)
  }
}

class UTP extends events.EventEmitter {
  constructor (opts, onconnection) {
    super()
    
    if (!opts) opts = {}

    this.socket = opts.socket || dgram.createSocket('udp4')
    this.socket.on('listening', () => this.emit('listening'))
    this.socket.on('message', this._onmessage.bind(this))
    this.socket.on('error', err => this.emit('error', err))
    this.socket.on('close', this._onclose.bind(this))

    this._id = alloc(this)
    this._ptr = 0
    this._sockets = []
    this._ready(this._init.bind(this))
    this._inited = false
    this._interval = null
    this._closing = false
    this._closed = false
    this._heap = null

    if (onconnection) this.on('connection', onconnection)
  }

  _onclose () {
    const self = this
    this._ready(function () {
      clearInterval(self._interval)
      em._destroy_utp(self._ptr)
    })
    this.emit('close')
  }

  _onaccept (socket) {
    const sock = new Socket(this)
    sock._ptr = socket
    sock._connected = true
    process.nextTick(() => this.emit('connection', sock))
    return sock._id
  }

  _onmessage (buf, rinfo) {
    if (!this._inited) return this.emit('message', buf, rinfo)

    const ptr = em._malloc(buf.length)
    em.HEAP8.set(buf, ptr)
    if (!em._process_udp(this._ptr, ptr, buf.length, ipToInt(rinfo.address), rinfo.port)) {
      this.emit('message', buf, rinfo)
    } else {
      process.nextTick(issueAcks, this)
    }
    em._free(ptr)
  }

  _init () {
    if (this._inited) return
    this._inited = true
    this._heap = em.HEAP8.buffer

    this._ptr = em._malloc(em._sizeof_utp_wrap())
    em._create_utp(this._ptr, this._id)

    this._interval = setInterval(() => em._check_timeouts(this._ptr), 500)
  }

  _ready (cb) {
    if (!ready) return cb()
    ready.push(cb)
  }

  connect (port, host) {
    if (!host) host = '127.0.0.1'

    const self = this
    const sock = new Socket(this)

    lookup(host, function (err, ip) {
      if (sock.destroyed) return
      if (err) return sock.destroy(err)
      if (!ip) return sock.destroy(new Error('Could not resolve ' + host))

      self._ready(function () {
        if (sock.destroyed) return
        const socket = em._connect_utp(self._ptr, sock._id, port, ipToInt(ip))
        sock._ptr = socket
      })
    })

    return sock
  }

  send (...args) {
    this.socket.send(...args)
  }

  bind (...args) {
    this.socket.bind(...args)
  }

  close (onclose) {
    if (onclose) this.once('close', onclose)
    this._closing = true
    this._ready(this._closeMaybe.bind(this))
  }

  _closeMaybe () {
    if (this._closing && !this._sockets.length && !this._closed && this._inited) {
      this._closed = true
      this.socket.close()
    }
  }

  listen (port) {
    const self = this
    this._ready(function () {
      self.socket.bind(port)
    })
  }
}

em.onRuntimeInitialized = function () {
  for (const fn of ready) fn()
  ready = null
}

function isIP (ip) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)
}

function lookup (ip, cb) {
  if (isIP(ip)) return cb(null, ip)
  require(dnsModule()).lookup(ip, cb)
}

function dnsModule () { // workaround for require('dns') in browsers
  return Math.random() < 1 ? 'dns' : ''
}

function issueAcks (self) {
  em._issue_deferred_acks(self._ptr)
}

function ipToInt (address) {
  const nums = address.split('.')
  return 256 ** 3 * parseInt(nums[0], 10) +
    256 ** 2 * parseInt(nums[1], 10) +
    256 * parseInt(nums[2], 10) +
    parseInt(nums[3], 10)
}

function intToIp (i) {
  return ((i & 4278190080) >>> 24) +
    '.' + ((i & 16711680) >>> 16) +
    '.' + ((i & 65280) >>> 8) +
    '.' + (i & 255)
}

function alloc (utp) {
  const free = allocated.indexOf(null)
  if (free > -1) {
    allocated[free] = utp
    return free
  }
  return allocated.push(utp) - 1
}
