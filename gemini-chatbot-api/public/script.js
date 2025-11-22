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
  const thinkingNode = appendMessage('bot', 'Gemini is thinking...');

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
      // Replace thinking text with an error message
      thinkingNode.textContent = `Error: ${resp.status} ${resp.statusText}`;
      return;
    }

    const data = await resp.json();
    // Update the thinking node with the reply from the server
    if (data && typeof data.reply === 'string') {
      // server may return timestamp
      const botTs = data.ts || new Date().toISOString();
      thinkingNode.textContent = data.reply;
      // store bot reply in conversation and persist
      conversation.push({ role: 'bot', content: data.reply, ts: botTs });
      if (conversation.length > 50) conversation = conversation.slice(-50);
      localStorage.setItem('conversation', JSON.stringify(conversation));
    } else {
      thinkingNode.textContent = 'No reply from server.';
    }

  } catch (err) {
    // Network or parsing error
    thinkingNode.textContent = `Request failed: ${err.message}`;
    console.error('Fetch /api/chat error:', err);
  }
});

function appendMessage(sender, text) {
  return appendMessage(sender, text, {});
}

// richer appendMessage that supports avatar and timestamp
function appendMessage(sender, text, opts = {}) {
  // opts: { timestamp }
  const wrapper = document.createElement('div');
  wrapper.classList.add('message', sender);

  const inner = document.createElement('div');
  inner.classList.add('message-inner');

  const avatar = document.createElement('div');
  avatar.classList.add('avatar');
  // avatar content: U for user, B for bot (simple)
  avatar.textContent = sender === 'user' ? 'U' : 'B';

  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  bubble.textContent = text;

  const ts = document.createElement('div');
  ts.classList.add('timestamp');
  const timeStr = opts.timestamp ? new Date(opts.timestamp).toLocaleString() : new Date().toLocaleString();
  ts.textContent = timeStr;

  inner.appendChild(avatar);
  inner.appendChild(bubble);
  inner.appendChild(ts);
  wrapper.appendChild(inner);

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble; // return bubble so callers can update text if needed
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
