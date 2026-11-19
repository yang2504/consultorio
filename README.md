# Consultorio Médico

Sistema local para un consultorio con un médico. La agenda distingue primera consulta y reconsulta, vinculadas al historial médico, los diagnósticos y los adjuntos del paciente. Las especialidades se encuentran en las opciones secundarias.

## Ejecutar en Windows x64

1. Extrae todo el ZIP en una carpeta.
2. Abre `Demostracion.cmd` para recorrer la aplicación con datos ficticios en memoria. Cierra esa ventana antes de abrir el modo persistente.
3. Abre `Iniciar-Consultorio.cmd` para el modo persistente. La primera vez, copia el código mostrado en la consola y crea la cuenta principal del consultorio. Esa cuenta permite agendar y registrar atención. En **Configuración** puedes crear accesos para recepción y el médico. Al configurar un perfil Médico, será el profesional predeterminado para las nuevas citas.
4. Mantén abierta la consola mientras usas el sistema en `http://127.0.0.1:4317`. Los datos persistentes se guardan en `%LOCALAPPDATA%\ConsultorioLocal\consultorio.sqlite`.

El ZIP incluye Node.js, dependencias de ejecución y la interfaz compilada. El navegador se conecta solo a la máquina local. Puedes descargar una copia desde **Configuración**. Para restaurarla, cierra el servidor, conserva aparte la carpeta de datos anterior completa y coloca el archivo descargado como `consultorio.sqlite` en una carpeta de datos vacía antes de volver a iniciar. Conserva las copias en almacenamiento protegido.

## Ejecutar en Mac Apple Silicon

El ZIP `Consultorio-macOS-arm64-v0.3.0.zip` incluye Node.js 22 para Apple Silicon, dependencias y la interfaz compilada para Safari 15.4 o posterior. Está preparado para MacBook Air M1 con macOS Monterey 12.4, sin instalar herramientas adicionales.

Extrae todo el ZIP, mueve la carpeta **Consultorio** a Documentos y abre **Iniciar-Consultorio.command**. Mantén la ventana de Terminal abierta. La primera vez, copia el código que muestra Terminal y crea la cuenta administradora con una contraseña de al menos ocho caracteres. El navegador predeterminado se abre en `http://127.0.0.1:4317`. Detén el servidor con **Control+C**.

El paquete no lleva base de datos, usuarios ni pacientes. La base vacía se crea al iniciar en `~/Library/Application Support/ConsultorioLocal/consultorio.sqlite` y conserva los registros posteriores. Las instrucciones completas están en **LEEME-Mac.txt**. Para generar este ZIP desde la máquina de desarrollo, ejecuta `npm run package:macos` (requiere Python 3 y Node.js en esa máquina). El script verifica el SHA-256 oficial, la arquitectura, la versión mínima de macOS del runtime, los permisos de ejecución y la integridad del ZIP. La ejecución nativa debe comprobarse en la Mac de destino.

## Aplicación nativa para Mac

El paquete `Consultorio-macOS-arm64-App-v0.3.1.zip` contiene **Consultorio.app**, con icono y menú propio. Abre el navegador, inicia el servidor sin Terminal y lo detiene desde **Consultorio → Salir de Consultorio**. La primera configuración muestra un código en una ventana nativa y lo copia al portapapeles. Usa la misma base de datos que la versión `.command`. Antes de cambiar, detén la instancia antigua con Control+C.

La app se compila en macOS con `npm run package:macos:app` o mediante el workflow manual **macOS App** de GitHub Actions. Requiere Xcode Command Line Tools solo en la máquina que compila; la Mac de destino no necesita herramientas adicionales. El bundle usa una firma ad-hoc para mantener su integridad; no tiene certificado Developer ID ni notarización de Apple. El workflow verifica la firma después de extraer el ZIP, ejecuta el binario nativo y prueba el runtime ARM64 con base vacía, configuración de la cuenta y apagado limpio. La apertura gráfica y los avisos de Gatekeeper deben comprobarse en la Mac de destino.

## Stack y arquitectura

- **React + Vite** para la interfaz en español. Los componentes de calendario, navegación, formularios y páginas se comunican con el backend por una API JSON.
- **Node.js 22 + Express** para el adaptador HTTP y el arranque local. El ejecutable de Node viaja en el ZIP, siguiendo el formato portable de Hostel Atatau.
- **SQLite** mediante `node:sqlite`, que sigue en desarrollo activo en Node 22. Las transacciones agrupan las escrituras de negocio y auditoría. Los archivos JPG/PNG se guardan en la misma base para incluirlos en la copia.

```text
frontend/src               Componentes de interfaz y cliente HTTP
backend/src/domain         Reglas y validación de datos
backend/src/application    Casos de uso sobre el puerto de persistencia
backend/src/adapters       HTTP, SQLite y datos de demostración
backend/src/server.js      Composición y arranque
```

## Funciones de esta versión

- Registro de pacientes desde Inicio o dentro de una nueva cita, con carnet, edad y teléfono. La edad se guarda junto a la fecha de registro para poder actualizarla. Los registros anteriores con fecha de nacimiento siguen mostrando su edad calculada.
- Búsqueda por carnet, nombres y apellidos, combinando palabras e ignorando mayúsculas y tildes. Nombres, carnets, usuarios y textos clínicos se guardan en mayúsculas. Las contraseñas conservan su escritura.
- Tipo de consulta editable, con sugerencia de reconsulta cuando el paciente ya tiene una cita vigente en su agenda. Las citas anteriores se mantienen sin clasificación hasta que se editen.
- Registro de atención con contenido clínico y diagnóstico, filtros del historial por tipo de consulta y diagnóstico, y desglose administrativo de primeras consultas y reconsultas.
- Calendario mensual, semanal y diario con la fecha de hoy resaltada. En mes y semana, cada casilla muestra hasta dos citas y un enlace al resto. Desde la agenda del día se puede abrir cada cita o crear una nueva. El minicalendario del formulario indica cruces por paciente, profesional, técnico o sala. El sistema usa una sala lógica por especialidad.
- Expediente con antecedentes, consultas, diagnósticos, órdenes, resultados e informes vinculables a una cita. Puedes cargar imágenes diagnósticas desde una cita o elegir una de las citas del paciente desde su expediente. La cita determina el paciente y la especialidad. Cada carga admite hasta cuatro archivos JPG o PNG de 5 MB cada uno.
- Pantalla por especialidad y asignación de estudios confirmados a técnicos. Los informes se imprimen o se guardan como PDF mediante el navegador.
- Reportes administrativos por especialidad y profesional. Perfiles de administración, medicina, recepción y técnica, contraseñas con scrypt, sesiones de ocho horas, auditoría local y copias manuales.

Para uso clínico con datos reales quedan pendientes el cifrado de la base y de las copias en reposo, la validación operativa de seguridad y recuperación, el visor DICOM y la integración con equipos de diagnóstico. Esta versión está orientada a demostración y pruebas. Las especialidades son fijas y cada cita sirve de vínculo para la orden y el resultado del estudio.

## Desarrollo

Instala Node.js 22.14 o posterior de la rama 22. Ejecuta `npm ci`, `npm test` y `npm run dev` para abrir la demostración. Para editar la interfaz con recarga automática, usa `npm run dev:ui` con el backend ejecutándose en el puerto 4317. Para regenerar el ZIP, ejecuta `npm run package:windows`. La compilación y la descarga del runtime se realizan en la máquina de desarrollo.
