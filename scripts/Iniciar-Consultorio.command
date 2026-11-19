#!/bin/bash
APP_DIR="$(cd -- "$(dirname -- "$0")" && pwd)" || exit 1
if [ ! -x "$APP_DIR/runtime/node" ] || [ ! -f "$APP_DIR/frontend/dist/index.html" ] || [ ! -f "$APP_DIR/backend/src/server.js" ]; then
  printf '\nExtrae todo el ZIP y abre este archivo desde la carpeta Consultorio.\n'
  read -r -p 'Pulsa Enter para cerrar.'
  exit 1
fi
printf '\nConsultorio médico\nMantén esta ventana abierta mientras utilizas el sistema.\nPara detenerlo, pulsa Control+C.\n\n'
"$APP_DIR/runtime/node" "$APP_DIR/backend/src/server.js" --open
status=$?
if [ "$status" -ne 0 ]; then
  printf '\nNo se pudo iniciar. Revisa el mensaje anterior.\n'
  read -r -p 'Pulsa Enter para cerrar.'
fi
exit "$status"
