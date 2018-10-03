#include "../utp.h"
#include <stdio.h>
#include <emscripten.h>

static struct sockaddr_in addr;

EM_JS(void, js_utp_on_message, (), { global._utp_on_message() });
EM_JS(void, js_utp_sendto, (int id, int buf, int len, int ip, int port), { global._utp_sendto(id, buf, len, ip, port) });
EM_JS(void, js_utp_on_read, (int id, int socket_id, int buf, int len), { global._utp_on_read(id, socket_id, buf, len) });
EM_JS(int, js_utp_on_accept, (int id, int socket), { return global._utp_on_accept(id, socket) });
EM_JS(void, js_utp_on_eof, (int id, int socket_id), { global._utp_on_eof(id, socket_id) });
EM_JS(void, js_utp_on_writable, (int id, int socket_id), { global._utp_on_writable(id, socket_id) });
EM_JS(void, js_utp_on_destroying, (int id, int socket_id), { global._utp_on_destroying(id, socket_id) });
EM_JS(void, js_utp_on_connect, (int id, int socket_id), { global._utp_on_connect(id, socket_id) });

struct utp_wrap {
  utp_context *ctx;
  int id;
};

static uint64
on_utp_state_change (utp_callback_arguments *a) {
  struct utp_wrap *wrap = utp_context_get_userdata(a->context);
  int socket_id = utp_get_userdata(a->socket);
 
  switch (a->state) {
    case UTP_STATE_CONNECT: {
      js_utp_on_connect(wrap->id, socket_id);
    }
    break;
    case UTP_STATE_EOF: {
      js_utp_on_eof(wrap->id, socket_id);
    }
    break;
    case UTP_STATE_WRITABLE: {
      js_utp_on_writable(wrap->id, socket_id);
    }
    break;
    case UTP_STATE_DESTROYING: {
      js_utp_on_destroying(wrap->id, socket_id);
    }
    break;
  }

  return 0;
}

static uint64
on_utp_firewall (utp_callback_arguments *a) {
  return 0;
}

static uint64
on_utp_accept (utp_callback_arguments *a) {
  struct utp_wrap *wrap = utp_context_get_userdata(a->context);
  int socket_id = js_utp_on_accept(wrap->id, a->socket);
  utp_set_userdata(a->socket, socket_id);
  return 0;
}

static uint64
on_utp_read (utp_callback_arguments *a) {
  struct utp_wrap *wrap = utp_context_get_userdata(a->context);
  int socket_id = utp_get_userdata(a->socket);
  
  js_utp_on_read(wrap->id, socket_id, (char *) a->buf, a->len);
  return 0;
}

static uint64
on_utp_sendto (utp_callback_arguments *a) {
  struct utp_wrap *wrap = utp_context_get_userdata(a->context);
  struct sockaddr_in *addr = a->address;
  js_utp_sendto(wrap->id, (char *) a->buf, a->len, addr->sin_addr.s_addr, addr->sin_port);
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void issue_deferred_acks (struct utp_wrap *wrap) {
  utp_issue_deferred_acks(wrap->ctx);
}

EMSCRIPTEN_KEEPALIVE
void check_timeouts (struct utp_wrap *wrap) {
  utp_check_timeouts(wrap->ctx);
}

EMSCRIPTEN_KEEPALIVE
int process_udp (struct utp_wrap *wrap, char *data, int nread, int ip, int port) {
  addr.sin_port = port;
  addr.sin_addr.s_addr = ip;

  if (utp_process_udp(wrap->ctx, data, nread, &addr, sizeof(struct sockaddr))) {
    return 1;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int sizeof_sockaddr () {
  return sizeof(struct sockaddr_in);
}

EMSCRIPTEN_KEEPALIVE
int sizeof_iovec () {
  return sizeof(struct utp_iovec);
}


EMSCRIPTEN_KEEPALIVE
int sizeof_utp_wrap () {
  return sizeof(struct utp_wrap);
}


EMSCRIPTEN_KEEPALIVE
int write_utp (utp_socket *socket, struct utp_iovec *io, char *data, int len) {
  io->iov_base = data;
  io->iov_len = len;
  return utp_writev(socket, io, 1);
}

EMSCRIPTEN_KEEPALIVE
void shutdown_utp (utp_socket *socket) {
  utp_shutdown(socket, SHUT_WR);
}

EMSCRIPTEN_KEEPALIVE
void close_socket (utp_socket *socket) {
  utp_close(socket);
}

EMSCRIPTEN_KEEPALIVE
void destroy_utp (struct utp_wrap *wrap) {
  utp_destroy(wrap->ctx);
}

EMSCRIPTEN_KEEPALIVE
int connect_utp (struct utp_wrap *wrap, int socket_id, int port, int ip) {
  struct sockaddr_in addr;

  addr.sin_family = AF_INET;
  addr.sin_port = port;
  addr.sin_addr.s_addr = ip;

  utp_socket *socket = utp_create_socket(wrap->ctx);
  utp_connect(socket, &addr, sizeof(struct sockaddr_in));

  utp_set_userdata(socket, socket_id);

  return socket;
}

EMSCRIPTEN_KEEPALIVE
void create_utp (struct utp_wrap *wrap, int id) {
  addr.sin_family = AF_INET;

  wrap->ctx = utp_init(2);
  wrap->id = id;
  utp_context_set_userdata(wrap->ctx, wrap);

  utp_set_callback(wrap->ctx, UTP_ON_FIREWALL, &on_utp_firewall);
  utp_set_callback(wrap->ctx, UTP_ON_ACCEPT, &on_utp_accept);
  utp_set_callback(wrap->ctx, UTP_SENDTO, &on_utp_sendto);
  utp_set_callback(wrap->ctx, UTP_ON_READ, &on_utp_read);
  utp_set_callback(wrap->ctx, UTP_ON_STATE_CHANGE, &on_utp_state_change);
}
