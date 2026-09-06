# Liminal Asset Previewer

Visor web **mobile-first** para revisar assets 3D `.glb` antes de integrarlos en el proyecto Liminal.

El visor usa **Babylon.js 9.25.0** y carga el modelo directamente en el navegador. El archivo seleccionado no se sube a ningún servidor.

## Abrir el visor

**GitHub Pages:** https://vgarcan.github.io/liminal-asset-previewer/

## Cómo usarlo

1. Abre el enlace de GitHub Pages desde PC, tablet o móvil.
2. Pulsa **Cargar GLB**.
3. Selecciona un archivo `.glb` del dispositivo.
4. Arrastra para rotar la cámara.
5. Haz pinch-to-zoom en móvil o usa la rueda del ratón en PC.
6. Usa **Centrar** para volver a encuadrar el asset.
7. Usa **Wireframe** para inspeccionar la geometría.
8. Activa/desactiva **Grid** para comprobar escala y apoyo.
9. Usa **Auto-rotar** para una revisión rápida.

En PC también puedes arrastrar un archivo `.glb` sobre el visor.

## Convención de escala

El proyecto utiliza como objetivo:

```text
1 unidad = 1 metro
```

El panel de información muestra las dimensiones aproximadas del asset para detectar errores de escala.

## Formato soportado

Actualmente:

- `.glb` ✅
- `.gltf` con archivos externos ❌

Se prioriza GLB porque empaqueta geometría, materiales y recursos en un único archivo.

## Información mostrada

El visor permite revisar:

- escala y dimensiones;
- proporciones;
- orientación;
- geometría;
- materiales;
- número de meshes;
- número de materiales;
- número aproximado de triángulos.

No sustituye las validaciones automáticas del futuro pipeline de assets.

## Arquitectura

```text
index.html
styles.css
app.js
.github/workflows/pages.yml
```

No hay backend ni proceso de build.

Babylon.js y el loader GLB están fijados a la versión `9.25.0` para que el visor no cambie de comportamiento por una actualización automática.

## Bug corregido respecto al primer prototipo

El primer prototipo intentaba crear `BABYLON.GridMaterial` sin cargar `babylonjs-materials`.

Eso generaba una excepción durante la inicialización **antes de registrar el evento del selector de archivos**. El resultado en móvil era exactamente el síntoma observado: se seleccionaba el GLB y aparentemente no ocurría nada.

Esta versión:

- elimina la dependencia de `GridMaterial`;
- construye el grid con primitivas incluidas en Babylon Core;
- carga el GLB como `Uint8Array` indicando explícitamente `pluginExtension: ".glb"`;
- muestra los errores dentro de la propia interfaz;
- valida extensión y archivos vacíos;
- permite volver a seleccionar el mismo archivo tras un fallo;
- encuadra automáticamente el modelo mediante su bounding box;
- incluye controles táctiles;
- incluye drag-and-drop en escritorio;
- libera el asset anterior antes de cargar el siguiente.

## Privacidad

Los GLB se leen mediante la API de archivos del navegador y se procesan localmente.

El visor no contiene ningún endpoint de subida.

## Desarrollo local

Puedes servir la carpeta con cualquier servidor HTTP estático:

```bash
python -m http.server 8000
```

y abrir:

```text
http://localhost:8000
```

## GitHub Pages

El workflow `.github/workflows/pages.yml` publica el contenido de la rama `main` mediante GitHub Actions.

Si el workflow indica que Pages todavía no está habilitado, abre:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Después vuelve a ejecutar el workflow.

## Nota de evolución

Este visor es una herramienta de revisión de assets. El juego principal podrá utilizar posteriormente paquetes ES modules/npm y un build pipeline dedicado sin cambiar el formato GLB de los assets aprobados.
