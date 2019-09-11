emcc -g -Wall -DPOSIX -fno-exceptions -O3 -fPIC -fno-rtti -Wno-sign-compare -fpermissive -s MODULARIZE=1 \
  deps/libutp/utp_internal.cpp \
  deps/libutp/utp_utils.cpp \
  deps/libutp/utp_hash.cpp \
  deps/libutp/utp_callbacks.cpp \
  deps/libutp/utp_api.cpp \
  deps/libutp/utp_packedsockaddr.cpp \
  binding.c -o binding.js
