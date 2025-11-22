const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const clearBtn = document.getElementById('clear-btn');

// Conversation history stored locally so the client can send context to the server.
// Each entry: { role: 'user'|'bot', content: '...' }
let conversation = [];

// Load persisted conversation (if any) and render it
try {
  const saved = localStorage.getItem('conversation');
  if (saved) {
    conversation = JSON.parse(saved);
    conversation.forEach(msg => appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, { timestamp: msg.ts }));
  }
} catch (err) {
  console.warn('Failed to load conversation from localStorage:', err);
  conversation = [];
}

// Manage a simple client session id so server can persist per-user history
let sessionId = localStorage.getItem('sessionId');
if (!sessionId) {
  // create a short random id
  sessionId = 's_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('sessionId', sessionId);
}

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  // Append user message locally and persist (include timestamp)
  const now = new Date().toISOString();
  appendMessage('user', userMessage, { timestamp: now });
  conversation.push({ role: 'user', content: userMessage, ts: now });
  // keep conversation reasonably small locally
  if (conversation.length > 50) conversation = conversation.slice(-50);
  localStorage.setItem('conversation', JSON.stringify(conversation));
  input.value = '';

  // Show temporary 'thinking' bot message and keep a reference so we can update it
  // Menggunakan indikator pengetikan dari desain baru
  const thinkingNode = showTypingIndicator();

  try {
    // Send the recent history (limit to last 20 entries) so the server can build a prompt
    const historyToSend = conversation.slice(-20);
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userMessage, history: historyToSend, sessionId })
    });

    if (!resp.ok) {
      removeTypingIndicator();
      // Replace thinking text with an error message
      appendMessage('bot', `Error: ${resp.status} ${resp.statusText}`);
      return;
    }

    const data = await resp.json();
    removeTypingIndicator();

    // Update the thinking node with the reply from the server
    if (data && typeof data.reply === 'string') {
      // server may return timestamp
      const botTs = data.ts || new Date().toISOString();
      appendMessage('bot', data.reply, { timestamp: botTs });
      // store bot reply in conversation and persist
      conversation.push({ role: 'bot', content: data.reply, ts: botTs });
      if (conversation.length > 50) conversation = conversation.slice(-50);
      localStorage.setItem('conversation', JSON.stringify(conversation));
    } else {
      appendMessage('bot', 'No reply from server.');
    }

  } catch (err) {
    // Network or parsing error
    thinkingNode.textContent = `Request failed: ${err.message}`;
    console.error('Fetch /api/chat error:', err);
  }
});

// richer appendMessage that supports avatar and timestamp
function appendMessage(sender, text, opts = {}) {
  // opts: { timestamp }
  const div = document.createElement('div');
  div.className = `flex gap-3 items-start ${sender === 'user' ? 'flex-row-reverse' : ''}`;
  
  const avatar = sender === 'bot' 
      ? `<div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 text-blue-600 mt-1"><i data-lucide="bot" class="w-4 h-4"></i></div>`
      : `<div class="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center shrink-0 text-slate-600 mt-1"><i data-lucide="user" class="w-4 h-4"></i></div>`;

  const bubbleClass = sender === 'bot'
      ? 'bg-white text-slate-600 border border-slate-100 rounded-tl-none'
      : 'bg-blue-600 text-white rounded-tr-none';

  // Menambahkan timestamp jika ada
  const timeStr = opts.timestamp ? new Date(opts.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
  const timestampHTML = timeStr ? `<p class="text-xs opacity-75 mt-2 text-right">${timeStr}</p>` : '';

  div.innerHTML = `
      ${avatar}
      <div class="${bubbleClass} p-3.5 rounded-2xl shadow-sm text-sm max-w-[85%] break-words">
          <p>${text}</p>
          ${timestampHTML}
      </div>
  `;
  
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  lucide.createIcons(); // Re-render icons
  return div.querySelector('.break-words p'); // return bubble's text node
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.id = 'typing-indicator';
    div.className = 'flex gap-3 items-start';
    div.innerHTML = `
        <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 text-blue-600 mt-1"><i data-lucide="bot" class="w-4 h-4"></i></div>
        <div class="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100">
            <div class="flex gap-1">
                <span class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                <span class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 75ms;"></span>
                <span class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 150ms;"></span>
            </div>
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    lucide.createIcons();
    return div;
}

// Clear conversation handler
async function clearConversation() {
  // clear local data
  conversation = [];
  localStorage.removeItem('conversation');

  // also clear server-side session if possible
  try {
    await fetch('/api/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (e) {
    // ignore network errors for clear
    console.warn('Failed to clear server session:', e);
  }

  // remove messages from UI
  chatBox.innerHTML = '';
}

clearBtn?.addEventListener('click', () => {
  clearConversation();
});

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}
