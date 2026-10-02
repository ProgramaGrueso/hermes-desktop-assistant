# 🤖 Hermes Desktop Assistant — Widget con Voz y Full Permisos

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![LM Studio](https://img.shields.io/badge/LM_Studio-Local_LLM-5C2D91?style=for-the-badge)](https://lmstudio.ai/)
[![Qwen 3.5](https://img.shields.io/badge/Model-Qwen_3.5_Uncensored-FF6F00?style=for-the-badge)](https://huggingface.co/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<p align="center">
  <strong>Asistente autónomo de escritorio y widget web flotante embebible con voz bidireccional continua (STT/TTS), streaming de razonamiento y ejecución de terminal en tiempo real con LM Studio local.</strong>
</p>

</div>

---

## 🌟 Características Principales

1. **Widget Flotante & Ventana Modal**:
   - Botón lanzador flotante (FAB) con animación de pulso radar y estado en tiempo real.
   - Ventana de chat desplegable con diseño moderno dark glassmorphism.
   - Acceso rápido a chips de acción y configuración de audio.

2. **Voz Bidireccional Completa**:
   - **Speech-to-Text (Micrófono 🎙️)**: Botón de micro con reconocimiento continuo en español (`SpeechRecognition`). Al activarse, pulsa visualmente y transcribe en tiempo real lo que dices.
   - **Text-to-Speech (Voz 🔊)**: Hermes responde con voz sintetizada natural en español (`SpeechSynthesis`), filtrando bloques de código o sintaxis de markdown para una locución fluida.
   - **Visualizador de Ondas**: Canvas interactivo que muestra las frecuencias de audio al hablar y al escuchar.
   - **Controles de Audio**: Botón de silenciar/reanudar, selector de voces y ajuste de velocidad.

3. **Modelo Qwen 3.5 9B Uncensored (LM Studio)**:
   - Conexión directa a LM Studio en `http://localhost:1234/v1`.
   - Streaming SSE con **separación de razonamiento** (`reasoning_content`): el pensamiento del modelo se muestra en un desplegable colapsable (`🧠 Razonamiento del modelo`) sin estorbar la lectura ni ser leído por el sintetizador de voz.

4. **⚡ Full Permisos (Terminal Execution)**:
   - Instrucciones de sistema sin restricciones ni filtros de censura corporativa.
   - Botón interactivo **▶ Ejecutar** en cada bloque de código de consola generado en el chat.
   - Endpoint seguro `/api/exec` para ejecutar comandos directamente en el sistema host y devolver la salida con código de salida y tiempo de respuesta en milisegundos.

---

## 🚀 Inicio Rápido

### 1. Iniciar el servidor
Desde la terminal en el directorio del proyecto:
```bash
./start.sh
# O alternativamente:
node server.js
```
El servidor se iniciará en `http://localhost:3333`.

### 2. Abrir la interfaz
Abre en tu navegador web:
```
http://localhost:3333
```
Verás la telemetría del sistema, el estado de conexión con LM Studio y el botón flotante en la esquina inferior derecha.

---

## 🌐 Cómo incrustar el Widget en cualquier otra página web

El widget es **100% independiente y portable**. Para incrustarlo en cualquier aplicación web (por ejemplo, en tus paneles administrativos, dashboards o proyectos locales como Hotel Wimbledon), solo agrega esta línea antes de cerrar `</body>`:

```html
<!-- Widget Hermes AI con Voz y Full Permisos -->
<script src="http://localhost:3333/hermes-widget.js"></script>
```

### Configuración opcional personalizada:
Puedes personalizar el comportamiento antes de cargar el script:
```html
<script>
  window.HermesConfig = {
    apiBase: 'http://localhost:3333',
    autoSpeak: true,       // Responder por voz automáticamente
    speechLang: 'es-ES',   // Idioma del micrófono y voz
    voiceRate: 1.05        // Velocidad de locución
  };
</script>
<script src="http://localhost:3333/hermes-widget.js"></script>
```

---

## 🛠️ Estructura del Proyecto

- [server.js](file:///mnt/Datos/Proyecto/DesktopAssistant/server.js): Servidor Node.js Express con proxy SSE para LM Studio, ejecución de comandos y telemetría del sistema.
- [public/hermes-widget.js](file:///mnt/Datos/Proyecto/DesktopAssistant/public/hermes-widget.js): Script portable del widget con STT, TTS, visualizador canvas y cliente de chat.
- [public/hermes-widget.css](file:///mnt/Datos/Proyecto/DesktopAssistant/public/hermes-widget.css): Estilos CSS modernos (glassmorphism, animaciones, terminal box, badges).
- [public/index.html](file:///mnt/Datos/Proyecto/DesktopAssistant/public/index.html): Dashboard interactivo de escritorio con telemetría de CPU/RAM, pruebas de terminal y guía de integración.
- [start.sh](file:///mnt/Datos/Proyecto/DesktopAssistant/start.sh): Script de arranque rápido.
