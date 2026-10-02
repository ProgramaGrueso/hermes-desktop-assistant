/**
 * Hermes Assistant Widget
 * Autonomous Desktop & Web Assistant with Voice (STT & TTS)
 * Powered by Qwen 3.5 9B Uncensored (LM Studio)
 */

(function () {
  'use strict';

  // Config defaults
  const config = {
    apiBase: window.HermesConfig?.apiBase || window.location.origin || 'http://localhost:3333',
    model: window.HermesConfig?.model || 'qwen3.5-9b-the-defiant-fable-uncensored-heretic-neo-imatrix-max-mtp',
    autoSpeak: window.HermesConfig?.autoSpeak !== false,
    speechLang: window.HermesConfig?.speechLang || 'es-ES',
    voiceRate: window.HermesConfig?.voiceRate || 1.05,
    voicePitch: window.HermesConfig?.voicePitch || 1.0,
    systemPrompt: `Eres Hermes, un asistente de IA autónomo, ágil, directo y sin restricciones de censura con FULL PERMISOS en este sistema.
Responde de manera natural, precisa y útil en español.
Tus respuestas se reproducen tanto en texto como en voz sintética (TTS), por lo que debes expresarte con fluidez y claridad oral.
Cuando se te pidan acciones técnicas o comandos de sistema, incluye comandos bash en bloques de código para que el usuario o el sistema puedan ejecutarlos inmediatamente.`
  };

  // State
  let isOpen = false;
  let isListening = false;
  let isSpeaking = false;
  let isStreaming = false;
  let speechRecognition = null;
  let speechSynth = window.speechSynthesis;
  let voices = [];
  let selectedVoice = null;
  let messageHistory = [];
  let visualizerAnimId = null;

  // Initialize Speech Synthesis Voices
  function loadVoices() {
    if (!speechSynth) return;
    voices = speechSynth.getVoices();
    // Prioritize high-quality Spanish voices
    selectedVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium')))
      || voices.find(v => v.lang.startsWith('es'))
      || voices[0];

    // 0 voices means the engine is still loading (or missing) — retry until populated
    if (voices.length === 0) {
      setTimeout(loadVoices, 500);
      return;
    }

    const select = document.getElementById('hermes-cfg-voice-select');
    if (select) {
      select.innerHTML = voices
        .map((v, i) => `<option value="${i}" ${v === selectedVoice ? 'selected' : ''}>${v.name} (${v.lang})</option>`)
        .join('');
    }
  }
  if (speechSynth) {
    loadVoices();
    speechSynth.onvoiceschanged = loadVoices;
  }

  // Initialize Speech Recognition (STT)
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser.');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = config.speechLang;

    recognition.onstart = () => {
      isListening = true;
      updateMicButtonState(true);
      setAudioStatus('Escuchando voz...', true);
      startVisualizer();
      stopSpeaking(); // Stop assistant TTS when user starts speaking
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const textarea = document.getElementById('hermes-user-input');
      if (textarea) {
        textarea.value = finalTranscript || interimTranscript;
        autoResizeTextarea(textarea);
      }
    };

    // Errors that are normal during continuous listening and must NOT kill the session
    const BENIGN_ERRORS = new Set(['no-speech', 'aborted']);

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' fire constantly with continuous=true; onend() restarts us
      if (BENIGN_ERRORS.has(event.error)) return;

      console.error('Speech recognition error:', event.error);
      isListening = false;
      if (speechRecognition === recognition) speechRecognition = null; // force a clean rebuild
      updateMicButtonState(false);
      stopVisualizer();
      setAudioStatus(`Micrófono bloqueado o no disponible (${event.error}). Revisa permisos.`, false);
    };

    recognition.onend = () => {
      if (isListening) {
        // Chrome ends continuous sessions on its own; restart with a small backoff
        // (restarting synchronously inside onend throws InvalidStateError)
        setTimeout(() => {
          if (!isListening) return;
          try {
            recognition.start();
          } catch (e) {
            // Already running: nothing to do, session is alive
            if (e?.name !== 'InvalidStateError') {
              console.warn('Recognition restart failed:', e);
              isListening = false;
              updateMicButtonState(false);
              stopVisualizer();
              setAudioStatus('Escucha detenida. Pulsa el micro para reintentar.', false);
            }
          }
        }, 300);
      } else {
        updateMicButtonState(false);
        stopVisualizer();
        setAudioStatus('En espera', false);
      }
    };

    return recognition;
  }

  function startListening() {
    // Chrome only grants the mic in a secure context: https, localhost or 127.0.0.1.
    // Opened via LAN IP (http://192.168.x.x:3333) it fails with 'not-allowed' and no explanation.
    if (!window.isSecureContext) {
      setAudioStatus('Micrófono bloqueado: abre Hermes en https o en localhost/127.0.0.1', false);
      alert('El reconocimiento de voz solo funciona en un contexto seguro.\n\nUsa:  http://localhost:3333  (no la IP de red, p. ej. http://192.168.18.7:3333)\nPara móvil o otro equipo necesitas HTTPS.');
      return;
    }

    if (!speechRecognition) {
      speechRecognition = initSpeechRecognition();
    }
    if (!speechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz (SpeechRecognition). Por favor usa Google Chrome, Edge o un navegador compatible.');
      return;
    }
    try {
      speechRecognition.start();
    } catch (e) {
      // Already listening — not an error
      if (e?.name !== 'InvalidStateError') console.warn('Recognition start exception:', e);
    }
  }

  function stopListening() {
    isListening = false;
    if (speechRecognition) {
      try {
        speechRecognition.stop();
      } catch (e) {}
    }
    updateMicButtonState(false);
    stopVisualizer();
    setAudioStatus('En espera', false);
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function updateMicButtonState(recording) {
    const micBtn = document.getElementById('hermes-mic-btn');
    if (micBtn) {
      if (recording) {
        micBtn.classList.add('recording');
        micBtn.title = 'Detener escucha';
      } else {
        micBtn.classList.remove('recording');
        micBtn.title = 'Hablar con micrófono';
      }
    }
  }

  // Keep-alive timer: Chrome pauses speechSynthesis silently after ~15s.
  let synthKeepAliveId = null;
  function startSynthKeepAlive() {
    stopSynthKeepAlive();
    synthKeepAliveId = setInterval(() => {
      if (!speechSynth) return;
      if (speechSynth.speaking && !speechSynth.paused) {
        // pause/resume resets Chrome's internal 15s cutoff timer
        speechSynth.pause();
        speechSynth.resume();
      }
    }, 10000);
  }
  function stopSynthKeepAlive() {
    if (synthKeepAliveId) {
      clearInterval(synthKeepAliveId);
      synthKeepAliveId = null;
    }
  }

  // Split long text into speakable chunks (Chrome truncates utterances > ~15s)
  function chunkForSpeech(text, maxLen = 220) {
    const parts = text.split(/(?<=[.!?…])\s+|\n+/);
    const chunks = [];
    let current = '';
    for (const part of parts) {
      const piece = part.trim();
      if (!piece) continue;
      if (current && (current + ' ' + piece).length > maxLen) {
        chunks.push(current);
        current = piece;
      } else {
        current = current ? current + ' ' + piece : piece;
      }
      // A single oversized token (no punctuation) still needs splitting
      while (current.length > maxLen) {
        chunks.push(current.slice(0, maxLen));
        current = current.slice(maxLen);
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  // Text-To-Speech Clean & Play
  function speakText(rawText) {
    if (!config.autoSpeak || !speechSynth) return;

    // Filter out code blocks, tags, reasoning and markdown characters for clear, pleasant voice
    let cleanText = rawText
      .replace(/```[\s\S]*?```/g, ' [bloque de código ejecutado] ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*#_~>]/g, '')
      .replace(/https?:\/\/\S+/g, 'enlace')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    stopSpeaking();

    // Pause the mic while speaking so the assistant does not transcribe itself
    const wasListening = isListening;
    if (wasListening) {
      isListening = false;
      try { speechRecognition?.stop(); } catch (e) {}
      updateMicButtonState(false);
    }

    const chunks = chunkForSpeech(cleanText);
    if (!chunks.length) return;

    isSpeaking = true;
    setAvatarSpeaking(true);
    setAudioStatus('Hermes hablando...', true);
    startVisualizer();
    startSynthKeepAlive();

    let index = 0;
    const speakNext = () => {
      if (!isSpeaking || index >= chunks.length) {
        finishSpeaking(wasListening);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = config.speechLang;
      utterance.rate = config.voiceRate;
      utterance.pitch = config.voicePitch;
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.onend = () => {
        if (isSpeaking) setTimeout(speakNext, 120); // small gap between chunks
      };
      utterance.onerror = (e) => {
        // 'interrupted'/'canceled' happen when we intentionally stop; ignore them
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn('TTS error:', e.error);
        finishSpeaking(wasListening);
      };
      speechSynth.speak(utterance);
    };

    speakNext();
  }

  function finishSpeaking(resumeListening = false) {
    stopSynthKeepAlive();
    isSpeaking = false;
    setAvatarSpeaking(false);
    setAudioStatus('En espera', false);
    stopVisualizer();
    if (resumeListening && !isListening) {
      startListening();
    }
  }

  function stopSpeaking() {
    if (speechSynth && speechSynth.speaking) {
      speechSynth.cancel();
    }
    isSpeaking = false;
    setAvatarSpeaking(false);
    stopVisualizer();
  }

  function setAvatarSpeaking(speaking) {
    const avatar = document.getElementById('hermes-avatar-wrap');
    if (avatar) {
      if (speaking) avatar.classList.add('speaking');
      else avatar.classList.remove('speaking');
    }
  }

  function setAudioStatus(text, active) {
    const statusEl = document.getElementById('hermes-audio-status-text');
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = active ? 'var(--hermes-primary)' : 'var(--hermes-text-muted)';
    }
  }

  // Canvas Audio Visualizer
  function startVisualizer() {
    const canvas = document.getElementById('hermes-wave-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    function render() {
      if (!isListening && !isSpeaking) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const mid = height / 2;

      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isListening ? '#ef4444' : '#00f2fe';

      for (let x = 0; x < width; x++) {
        const freq = 0.08;
        const amp = isListening ? 6 : 5;
        const y = mid + Math.sin(x * freq + phase) * Math.sin(x * 0.02) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.18;
      visualizerAnimId = requestAnimationFrame(render);
    }

    if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);
    render();
  }

  function stopVisualizer() {
    if (visualizerAnimId) {
      cancelAnimationFrame(visualizerAnimId);
      visualizerAnimId = null;
    }
    const canvas = document.getElementById('hermes-wave-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw quiet baseline
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }
  }

  // Execute terminal command via backend API
  async function runTerminalCommand(command, resultContainerId) {
    const container = document.getElementById(resultContainerId);
    if (!container) return;

    container.innerHTML = `
      <div class="hermes-terminal-output">
        <div class="term-header">
          <span>⚡ Ejecutando: ${escapeHtml(command)}</span>
          <span>Procesando...</span>
        </div>
        <pre>Ejecutando en el sistema...</pre>
      </div>
    `;

    try {
      const res = await fetch(`${config.apiBase}/api/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      const data = await res.json();

      const output = (data.stdout || '') + (data.stderr ? `\n[STDERR]: ${data.stderr}` : '');
      const statusBadge = data.exitCode === 0 ? '✓ Exitoso' : `✗ Error (${data.exitCode})`;
      const statusColor = data.exitCode === 0 ? 'var(--hermes-success)' : 'var(--hermes-danger)';

      container.innerHTML = `
        <div class="hermes-terminal-output" style="border-color: ${statusColor}">
          <div class="term-header">
            <span>⚡ ${escapeHtml(command)}</span>
            <span style="color: ${statusColor}">${statusBadge} (${data.durationMs}ms)</span>
          </div>
          <pre>${escapeHtml(output || '(Sin salida de texto)')}</pre>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="hermes-terminal-output" style="border-color: var(--hermes-danger)">
          <div class="term-header">
            <span>⚡ Error de ejecución</span>
          </div>
          <pre>${escapeHtml(err.message)}</pre>
        </div>
      `;
    }
  }

  // Send message to Hermes
  async function sendMessage(text) {
    if (!text || !text.trim() || isStreaming) return;
    const cleanPrompt = text.trim();

    // Stop listening when sending
    if (isListening) stopListening();

    // Add user message to UI
    appendUserMessage(cleanPrompt);

    // Clear textarea
    const textarea = document.getElementById('hermes-user-input');
    if (textarea) {
      textarea.value = '';
      autoResizeTextarea(textarea);
    }

    // Build history for API
    messageHistory.push({ role: 'user', content: cleanPrompt });

    // Prepare assistant UI row with reasoning and content
    const msgId = 'hermes-msg-' + Date.now();
    const assistantRow = createAssistantMessageElement(msgId);
    const messagesContainer = document.getElementById('hermes-messages-area');
    messagesContainer.appendChild(assistantRow);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    isStreaming = true;
    document.getElementById('hermes-send-btn').disabled = true;

    let fullReasoning = '';
    let fullContent = '';

    try {
      const response = await fetch(`${config.apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: config.systemPrompt },
            ...messageHistory
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 3072
        })
      });

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta || {};

            // Handle reasoning delta
            if (delta.reasoning_content) {
              fullReasoning += delta.reasoning_content;
              updateAssistantReasoning(msgId, fullReasoning);
            }

            // Handle output content delta
            if (delta.content) {
              fullContent += delta.content;
              updateAssistantContent(msgId, fullContent);
            }

            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          } catch (e) {
            // Ignore parse errors on partial frames
          }
        }
      }

      // Finalize assistant message
      finalizeAssistantMessage(msgId, fullContent, fullReasoning);
      messageHistory.push({ role: 'assistant', content: fullContent });

      // Speak response out loud in voice!
      if (fullContent) {
        speakText(fullContent);
      }
    } catch (err) {
      console.error('Error fetching chat completion:', err);
      updateAssistantContent(msgId, `⚠️ **Error de conexión con Hermes / LM Studio:**\n${err.message}\n\nAsegúrate de que LM Studio esté activo en el puerto 1234 con el modelo cargado.`);
    } finally {
      isStreaming = false;
      document.getElementById('hermes-send-btn').disabled = false;
    }
  }

  // UI Element Builders
  function appendUserMessage(text) {
    const container = document.getElementById('hermes-messages-area');
    const row = document.createElement('div');
    row.className = 'hermes-msg-row user';
    row.innerHTML = `
      <div class="hermes-msg-bubble">${escapeHtml(text)}</div>
      <div class="hermes-msg-footer" style="justify-content: flex-end;">${formatTime(new Date())}</div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  function createAssistantMessageElement(msgId) {
    const row = document.createElement('div');
    row.className = 'hermes-msg-row assistant';
    row.id = msgId;
    row.innerHTML = `
      <div class="hermes-reasoning-box" style="display: none;" id="${msgId}-reasoning-box">
        <details>
          <summary class="hermes-reasoning-summary">
            <span>🧠 Razonamiento del modelo</span>
          </summary>
          <div class="hermes-reasoning-content" id="${msgId}-reasoning-content"></div>
        </details>
      </div>
      <div class="hermes-msg-bubble" id="${msgId}-bubble">
        <span class="hermes-loading-dots">Hermes está pensando...</span>
      </div>
      <div class="hermes-msg-footer" id="${msgId}-footer" style="display: none;">
        <span>${formatTime(new Date())}</span>
        <span>•</span>
        <button class="hermes-btn-speak-again" id="${msgId}-speak-btn">🔊 Escuchar voz</button>
      </div>
    `;
    return row;
  }

  function updateAssistantReasoning(msgId, reasoningText) {
    const box = document.getElementById(`${msgId}-reasoning-box`);
    const content = document.getElementById(`${msgId}-reasoning-content`);
    if (box && content) {
      box.style.display = 'block';
      content.textContent = reasoningText;
    }
  }

  function updateAssistantContent(msgId, contentText) {
    const bubble = document.getElementById(`${msgId}-bubble`);
    if (bubble) {
      bubble.innerHTML = renderMarkdown(contentText);
    }
  }

  function finalizeAssistantMessage(msgId, contentText, reasoningText) {
    const bubble = document.getElementById(`${msgId}-bubble`);
    const footer = document.getElementById(`${msgId}-footer`);
    const speakBtn = document.getElementById(`${msgId}-speak-btn`);

    if (bubble) {
      bubble.innerHTML = renderMarkdown(contentText);
      attachCodeBlockListeners(bubble);
    }

    if (footer) {
      footer.style.display = 'flex';
    }

    if (speakBtn) {
      speakBtn.onclick = () => speakText(contentText);
    }
  }

  // Markdown & Code block parser with Run Terminal Command button
  function renderMarkdown(text) {
    if (!text) return '';

    // Extract code blocks with bash/sh execution capabilities
    let html = text.replace(/```([a-zA-Z0-9_\-\s]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const cleanLang = (lang || 'code').trim().toLowerCase();
      const codeId = 'hermes-code-' + Math.random().toString(36).substring(2, 9);
      const isBash = ['bash', 'sh', 'shell', 'zsh', 'terminal'].includes(cleanLang);

      const runButtonHtml = isBash
        ? `<button class="hermes-btn-code-run" data-command="${escapeAttr(code.trim())}" data-target="${codeId}-output">
            <span>▶ Ejecutar</span>
          </button>`
        : '';

      return `
        <div class="hermes-code-block">
          <div class="hermes-code-header">
            <span>${escapeHtml(cleanLang)}</span>
            <div class="hermes-code-actions">
              ${runButtonHtml}
              <button class="hermes-btn-code-copy" data-copy="${escapeAttr(code)}">Copiar</button>
            </div>
          </div>
          <pre><code>${escapeHtml(code)}</code></pre>
          <div id="${codeId}-output"></div>
        </div>
      `;
    });

    // Inline formatting
    html = html
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 5px;border-radius:4px;color:#38bdf8;">$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');

    return html;
  }

  function attachCodeBlockListeners(container) {
    // Run buttons
    container.querySelectorAll('.hermes-btn-code-run').forEach(btn => {
      btn.onclick = () => {
        const cmd = btn.getAttribute('data-command');
        const targetId = btn.getAttribute('data-target');
        runTerminalCommand(cmd, targetId);
      };
    });

    // Copy buttons
    container.querySelectorAll('.hermes-btn-code-copy').forEach(btn => {
      btn.onclick = () => {
        const textToCopy = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(textToCopy).then(() => {
          btn.textContent = '¡Copiado!';
          setTimeout(() => (btn.textContent = 'Copiar'), 1800);
        });
      };
    });
  }

  // Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // Toggle Widget open/close
  function toggleWidget() {
    isOpen = !isOpen;
    const container = document.getElementById('hermes-chat-container');
    const launcher = document.getElementById('hermes-widget-launcher');

    if (isOpen) {
      container.classList.add('active');
      launcher.classList.add('open');
      const input = document.getElementById('hermes-user-input');
      if (input) input.focus();
    } else {
      container.classList.remove('active');
      launcher.classList.remove('open');
      if (isListening) stopListening();
      if (isSpeaking) stopSpeaking();
    }
  }

  // Build the entire DOM structure
  function injectWidgetDOM() {
    if (document.getElementById('hermes-widget-root')) return;

    // Load stylesheet if not already present
    if (!document.getElementById('hermes-widget-css')) {
      const link = document.createElement('link');
      link.id = 'hermes-widget-css';
      link.rel = 'stylesheet';
      link.href = `${config.apiBase}/hermes-widget.css`;
      document.head.appendChild(link);
    }

    const root = document.createElement('div');
    root.id = 'hermes-widget-root';

    root.innerHTML = `
      <!-- Launcher Button -->
      <button id="hermes-widget-launcher" title="Abrir Hermes AI" aria-label="Hermes AI Assistant">
        <div class="hermes-pulse-ring"></div>
        <div class="hermes-status-dot"></div>
        <svg class="hermes-fab-icon" viewBox="0 0 24 24">
          <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
          <path d="M16 11v1a4 4 0 0 1-8 0v-1" />
          <path d="M12 16v4" />
          <path d="M8 20h8" />
          <path d="M4 10l-2 2 2 2" />
          <path d="M20 10l2 2-2 2" />
        </svg>
      </button>

      <!-- Chat Modal Container -->
      <div id="hermes-chat-container">
        <!-- Header -->
        <div class="hermes-header">
          <div class="hermes-header-left">
            <div class="hermes-avatar-wrap" id="hermes-avatar-wrap" title="Hermes - Asistente Autónomo">
              <div class="hermes-avatar-pulse"></div>
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
                <path d="M8 12h.01M16 12h.01" />
              </svg>
            </div>
            <div class="hermes-title-group">
              <h3>
                Hermes AI
                <span class="hermes-badge-perm">Full Permisos</span>
              </h3>
              <div class="hermes-subtitle">
                <span class="hermes-status-live"></span>
                <span id="hermes-model-name-label">Qwen 3.5 9B Uncensored</span>
              </div>
            </div>
          </div>
          <div class="hermes-header-actions">
            <!-- Mute/Audio toggle -->
            <button class="hermes-btn-icon active" id="hermes-btn-tts-toggle" title="Voz activada / silenciar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <!-- Settings button -->
            <button class="hermes-btn-icon" id="hermes-btn-settings" title="Configuración">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <!-- Close button -->
            <button class="hermes-btn-icon" id="hermes-btn-close" title="Cerrar ventana">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Audio status & waveform bar -->
        <div class="hermes-audio-bar">
          <div class="hermes-audio-status">
            <span id="hermes-audio-status-text">En espera</span>
          </div>
          <canvas id="hermes-wave-canvas" class="hermes-wave-canvas" width="120" height="18"></canvas>
        </div>

        <!-- Settings Panel (Hidden by default) -->
        <div class="hermes-settings-panel" id="hermes-settings-panel">
          <div class="hermes-settings-header">
            <h4>Configuración de Hermes</h4>
            <button class="hermes-btn-icon" id="hermes-settings-close-btn">&times;</button>
          </div>
          <div class="hermes-form-group">
            <label>Modelo LM Studio:</label>
            <input type="text" id="hermes-cfg-model" value="${escapeAttr(config.model)}" />
          </div>
          <div class="hermes-form-group">
            <label>URL API Base:</label>
            <input type="text" id="hermes-cfg-api" value="${escapeAttr(config.apiBase)}" />
          </div>
          <div class="hermes-form-group">
            <label class="hermes-toggle-label">
              <span>Respuesta por voz (TTS automático)</span>
              <input type="checkbox" id="hermes-cfg-autospeak" class="hermes-toggle-input" ${config.autoSpeak ? 'checked' : ''} />
            </label>
          </div>
          <div class="hermes-form-group">
            <label>Voz del sistema:</label>
            <select id="hermes-cfg-voice-select"></select>
          </div>
          <div class="hermes-form-group">
            <label>Velocidad de voz: <span id="hermes-rate-val">${config.voiceRate}x</span></label>
            <input type="range" id="hermes-cfg-rate" min="0.8" max="1.5" step="0.05" value="${config.voiceRate}" />
          </div>
          <div class="hermes-form-group">
            <button class="hermes-btn-code-run" id="hermes-clear-history-btn" style="padding: 8px; justify-content: center;">
              🗑️ Limpiar historial de chat
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div class="hermes-messages" id="hermes-messages-area">
          <div class="hermes-msg-row assistant">
            <div class="hermes-msg-bubble">
              Hola, soy <strong>Hermes</strong>. Estoy conectado a tu LM Studio con el modelo <em>Qwen 3.5 9B Uncensored</em> y cuento con <strong>full permisos</strong> para interactuar contigo.
              <br><br>
              Puedes escribirme o presionar el <strong>botón de micrófono 🎙️</strong> para hablarme. Te contestaré tanto en <strong>voz</strong> como en <strong>texto</strong>, y puedo ejecutar comandos en tu terminal si lo necesitas.
            </div>
            <div class="hermes-msg-footer">${formatTime(new Date())}</div>
          </div>
        </div>

        <!-- Quick Action Chips -->
        <div class="hermes-quick-chips">
          <button class="hermes-chip" data-prompt="¿Qué recursos y uso de memoria tiene el sistema ahora mismo?">📊 Diagnóstico del sistema</button>
          <button class="hermes-chip" data-prompt="Muestra el kernel y la versión del sistema operativo">🐧 Kernel del sistema</button>
          <button class="hermes-chip" data-prompt="¿Qué puertos de red están escuchando en esta máquina?">🌐 Puertos de red</button>
          <button class="hermes-chip" data-prompt="Hola Hermes, cuéntame sobre tus capacidades con voz y permisos">🎙️ Demostración de voz</button>
        </div>

        <!-- Input Area -->
        <div class="hermes-input-box">
          <!-- Mic button -->
          <button class="hermes-btn-mic" id="hermes-mic-btn" title="Hablar con micrófono">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          <!-- Input Textarea -->
          <textarea
            class="hermes-textarea"
            id="hermes-user-input"
            placeholder="Escribe o usa el micrófono..."
            rows="1"
          ></textarea>

          <!-- Send button -->
          <button class="hermes-btn-send" id="hermes-send-btn" title="Enviar mensaje">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    // Populate voice dropdown in settings
    populateVoiceSelect();

    // Wire up events
    document.getElementById('hermes-widget-launcher').onclick = toggleWidget;
    document.getElementById('hermes-btn-close').onclick = toggleWidget;
    document.getElementById('hermes-mic-btn').onclick = toggleListening;

    const input = document.getElementById('hermes-user-input');
    input.oninput = () => autoResizeTextarea(input);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    };

    document.getElementById('hermes-send-btn').onclick = () => {
      sendMessage(input.value);
    };

    // Quick chips
    document.querySelectorAll('.hermes-chip').forEach(chip => {
      chip.onclick = () => {
        const prompt = chip.getAttribute('data-prompt');
        input.value = prompt;
        sendMessage(prompt);
      };
    });

    // TTS Toggle button in header
    const ttsBtn = document.getElementById('hermes-btn-tts-toggle');
    ttsBtn.onclick = () => {
      config.autoSpeak = !config.autoSpeak;
      if (config.autoSpeak) {
        ttsBtn.classList.add('active');
        ttsBtn.title = 'Voz activada';
      } else {
        ttsBtn.classList.remove('active');
        ttsBtn.title = 'Voz silenciada';
        stopSpeaking();
      }
      document.getElementById('hermes-cfg-autospeak').checked = config.autoSpeak;
    };

    // Settings Toggle
    const settingsPanel = document.getElementById('hermes-settings-panel');
    document.getElementById('hermes-btn-settings').onclick = () => {
      settingsPanel.classList.toggle('active');
    };
    document.getElementById('hermes-settings-close-btn').onclick = () => {
      settingsPanel.classList.remove('active');
    };

    document.getElementById('hermes-cfg-autospeak').onchange = (e) => {
      config.autoSpeak = e.target.checked;
      if (config.autoSpeak) ttsBtn.classList.add('active');
      else {
        ttsBtn.classList.remove('active');
        stopSpeaking();
      }
    };

    document.getElementById('hermes-cfg-rate').oninput = (e) => {
      config.voiceRate = parseFloat(e.target.value);
      document.getElementById('hermes-rate-val').textContent = `${config.voiceRate}x`;
    };

    document.getElementById('hermes-cfg-voice-select').onchange = (e) => {
      const idx = parseInt(e.target.value, 10);
      if (voices[idx]) selectedVoice = voices[idx];
    };

    document.getElementById('hermes-clear-history-btn').onclick = () => {
      messageHistory = [];
      const messagesArea = document.getElementById('hermes-messages-area');
      messagesArea.innerHTML = `
        <div class="hermes-msg-row assistant">
          <div class="hermes-msg-bubble">Historial limpiado. Listo para una nueva conversación.</div>
          <div class="hermes-msg-footer">${formatTime(new Date())}</div>
        </div>
      `;
      settingsPanel.classList.remove('active');
    };

    // Initial silent baseline for visualizer
    stopVisualizer();
  }

  function populateVoiceSelect() {
    const select = document.getElementById('hermes-cfg-voice-select');
    if (!select || !voices || voices.length === 0) return;
    select.innerHTML = '';
    voices.forEach((v, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = `${v.name} (${v.lang})${v.default ? ' [Default]' : ''}`;
      if (v === selectedVoice) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // Auto-init on DOMContentLoaded or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidgetDOM);
  } else {
    injectWidgetDOM();
  }

  // Expose global controller
  window.HermesWidget = {
    open: () => { if (!isOpen) toggleWidget(); },
    close: () => { if (isOpen) toggleWidget(); },
    toggle: toggleWidget,
    send: sendMessage,
    speak: speakText,
    stopSpeaking,
    toggleListening
  };
})();
