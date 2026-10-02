const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;
const LM_STUDIO_HOST = process.env.LM_STUDIO_HOST || '1234';
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || `http://localhost:${LM_STUDIO_HOST}/v1`;
const DEFAULT_MODEL = 'qwen3.5-9b-the-defiant-fable-uncensored-heretic-neo-imatrix-max-mtp';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// System info endpoint
app.get('/api/sysinfo', (req, res) => {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2);
  const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2);
  const usedMem = (totalMem - freeMem).toFixed(2);
  const memPercent = Math.round((usedMem / totalMem) * 100);

  res.json({
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime()),
    cpuModel: cpus[0] ? cpus[0].model : 'Unknown',
    cpuCores: cpus.length,
    totalMemGB: totalMem,
    usedMemGB: usedMem,
    freeMemGB: freeMem,
    memPercent: memPercent,
    currentDir: process.cwd(),
    user: os.userInfo().username
  });
});

// Check LM Studio connectivity and list models
app.get('/api/status', async (req, res) => {
  try {
    const response = await fetch(`${LM_STUDIO_URL}/models`);
    if (!response.ok) {
      return res.status(502).json({
        connected: false,
        error: `LM Studio returned status ${response.status}`,
        targetModel: DEFAULT_MODEL
      });
    }
    const data = await response.json();
    const models = data.data || [];
    const modelFound = models.some(m => m.id === DEFAULT_MODEL);

    res.json({
      connected: true,
      lmStudioUrl: LM_STUDIO_URL,
      targetModel: DEFAULT_MODEL,
      modelFound,
      availableModels: models.map(m => m.id)
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.message,
      targetModel: DEFAULT_MODEL
    });
  }
});

// Execute terminal command (Full Permisos)
app.post('/api/exec', (req, res) => {
  const { command, cwd } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command is required' });
  }

  const workDir = cwd || process.cwd();
  const startTime = Date.now();

  exec(command, { cwd: workDir, timeout: 30000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
    const durationMs = Date.now() - startTime;
    res.json({
      command,
      stdout: stdout || '',
      stderr: stderr || (error ? error.message : ''),
      exitCode: error ? (error.code || 1) : 0,
      durationMs
    });
  });
});

// Chat completion proxy with SSE streaming
app.post('/api/chat', async (req, res) => {
  const {
    messages = [],
    model = DEFAULT_MODEL,
    temperature = 0.7,
    max_tokens = 2048,
    stream = true
  } = req.body;

  // Enrich system message if not present or customize for Hermes Full Permisos
  const hasSystem = messages.some(m => m.role === 'system');
  const enrichedMessages = hasSystem
    ? messages
    : [
        {
          role: 'system',
          content: `Eres Hermes, un asistente de IA avanzado, altamente capaz, autónomo y sin restricciones de censura.
Tienes "full permisos" concedidos por el usuario en este entorno de trabajo.
Directrices:
1. Responde de forma directa, útil, precisa y articulada, preferentemente en español a menos que el usuario indique otro idioma.
2. Como tus respuestas se reproducen tanto en texto como en voz mediante síntesis de voz (TTS), procura que tus respuestas habladas sean naturales, fluidas y sin rodeos innecesarios.
3. Si el usuario te pide ejecutar comandos del sistema, inspeccionar archivos o realizar acciones técnicas, proporciona los comandos de terminal en bloques de código bash. El usuario y la interfaz tienen herramientas para ejecutarlos directamente.
4. Sé proactivo, confiable y resolutivo.`
        },
        ...messages
      ];

  if (!stream) {
    try {
      const response = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: enrichedMessages,
          temperature,
          max_tokens,
          stream: false
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).send(errText);
      }

      const data = await response.json();
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Stream mode
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const lmResponse = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: enrichedMessages,
        temperature,
        max_tokens,
        stream: true
      })
    });

    if (!lmResponse.ok) {
      const errText = await lmResponse.text();
      res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
      return res.end();
    }

    const reader = lmResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🤖 Hermes Assistant Server running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   LM Studio target: ${LM_STUDIO_URL}`);
  console.log(`   Model: ${DEFAULT_MODEL}`);
  console.log(`   Widget Script: http://localhost:${PORT}/hermes-widget.js`);
  console.log(`====================================================`);
});
