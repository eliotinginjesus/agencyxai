const express = require('express');
const app = express();
const port = 3000;
const dotenv = require('dotenv');
const cors = require('cors');
const {
  GoogleGenerativeAI,
} = require('@google/generative-ai');

// <<< BARU: Impor 'fs' (File System) dan 'path'
const fs = require('fs');
const path = require('path');

// Muat variabel lingkungan (API_KEY) dari file .env
dotenv.config();

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// --- Inisialisasi Model AI ---
const ai = new GoogleGenerativeAI(process.env.API_KEY);
const model = ai.getGenerativeModel({
  model: 'gemini-2.5-flash',
});

// --- RAG: Muat Database Produk ---
// <<< BARU: Kita muat data produk dari file JSON saat server menyala
let productDB;
try {
  const dbPath = path.join(__dirname, 'products.json'); // <<< MODIFIKASI: Diubah dari 'data_produk.json'
  const dbRaw = fs.readFileSync(dbPath, 'utf-8');
  productDB = JSON.parse(dbRaw);
  console.log("Database produk 'products.json' berhasil dimuat!"); // <<< MODIFIKASI
} catch (error) {
  console.error("Gagal memuat 'products.json':", error.message); // <<< MODIFIKASI
  console.error("Pastikan file 'products.json' ada di folder yang sama dengan 'index.js'"); // <<< MODIFIKASI
  productDB = { products: [] }; // Default ke array kosong jika gagal
}

// <<< BARU: Ini adalah instruksi sistem permanen untuk AI
const SYSTEM_INSTRUCTION = `
Anda adalah Customer Service AI untuk "Sinar Box", sebuah toko spesialis neon box di Pontianak.
Tugas Anda adalah menjawab pertanyaan pelanggan HANYA berdasarkan informasi dalam "KONTEKS PRODUK" yang diberikan.
- JANGAN mengarang harga, spesifikasi, atau informasi lain.
- Jika informasi tidak ada di konteks, jawab dengan sopan bahwa Anda tidak memiliki informasi tersebut atau akan menanyakannya ke tim.
- Jawab dengan ramah, profesional, dan to-the-point.
- Gunakan bahasa Indonesia.
`;

// Simple in-memory session store
const sessions = new Map();

// --- Fungsi Helper (Milik Anda, tidak diubah) ---
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function trimHistoryByTokens(history, maxTokens) {
  if (!Array.isArray(history)) return [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    total += estimateTokens(history[i].content || '');
    if (total > maxTokens) {
      return history.slice(i + 1);
    }
  }
  return history;
}

// --- RAG: Fungsi Pencarian (Retrieval) ---
// <<< BARU: Fungsi pencarian produk berdasarkan kata kunci
function findRelevantProducts(userQuery) {
  const query = userQuery.toLowerCase();
  let relevantProducts = [];

  if (!productDB || !productDB.products) {
    console.warn("ProductDB tidak ada atau kosong.");
    return [];
  }

  for (const product of productDB.products) {
    for (const keyword of product.keywords) {
      if (query.includes(keyword.toLowerCase())) {
        relevantProducts.push(product.data);
        break; // Lanjut ke produk berikutnya
      }
    }
  }
  
  // Menggunakan Set untuk memastikan tidak ada data duplikat
  const uniqueProducts = [...new Set(relevantProducts)];
  return uniqueProducts;
}


// --- Rute API Chat (INI YANG DIMODIFIKASI) ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    // 1. Ambil/Inisialisasi history (Logika Anda, tidak berubah)
    let history = [];
    if (sessionId && sessions.has(sessionId)) {
      history = sessions.get(sessionId);
    } else if (sessionId) {
      sessions.set(sessionId, history);
    }

    // 2. Simpan pesan user (Logika Anda, tidak berubah)
    const now = new Date().toISOString();
    history.push({ role: 'user', content: String(message), ts: now });
    history = trimHistoryByTokens(history, 1500); // Trim
    
    // --- <<< MODIFIKASI INTI: RAG DIMULAI DI SINI ---
    
    // 3. (Retrieval) Ambil data produk yang relevan berdasarkan pesan user
    const foundProducts = findRelevantProducts(message);

    // 4. (Augmentation) Siapkan "Konteks" untuk AI
    let context = "";
    if (foundProducts.length > 0) {
      context = JSON.stringify(foundProducts, null, 2);
    } else {
      context = "Tidak ada produk atau informasi yang relevan ditemukan di database.";
    }

    const contextString = `
--- KONTEKS PRODUK (HANYA GUNAKAN INFO INI) ---
${context}
--- AKHIR KONTEKS ---
`;

    // 5. Buat prompt history (Logika Anda, sedikit dimodifikasi)
    const parts = history.map(item => {
      const role = item.role === 'bot' || item.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${item.content}`;
    });
    // Jangan tambahkan 'Assistant:' di sini, kita tambahkan di finalPrompt

    const historyString = parts.join('\n');
    
    // 6. (Generation) Buat Prompt Final yang LENGKAP
    // Ini menggabungkan: Instruksi + Konteks + History
    const finalPrompt = 
      SYSTEM_INSTRUCTION + 
      contextString + 
      "\n--- HISTORY PERCAKAPAN SEBELUMNYA ---\n" +
      historyString + 
      "\nAssistant:"; // AI akan melanjutkan dari sini

    // --- RAG SELESAI, KEMBALI KE LOGIKA ANDA ---

    // 7. Panggil model dengan prompt LENGKAP
    const result = await model.generateContent(finalPrompt);
    const response = result.response;
    const text = response.text();

    // 8. Simpan balasan bot ke history (Logika Anda, tidak berubah)
    const botTs = new Date().toISOString();
    history.push({ role: 'bot', content: String(text), ts: botTs });
    history = trimHistoryByTokens(history, 1500); // Trim lagi
    if (sessionId) sessions.set(sessionId, history);

    // 9. Kirim balasan ke user (Logika Anda, tidak berubah)
    res.json({ reply: text, ts: botTs });

  } catch (error) {
    console.error('Error calling Generative AI:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Clear server-side session (Logika Anda, tidak berubah)
app.post('/api/clear', (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Rute GET dasar (Logika Anda, tidak berubah)
app.get('/', (req, res) => {
  res.send(`API Key ditemukan: ${process.env.API_KEY ? 'Ya' : 'Tidak'}. Database Produk: ${productDB.products.length} item dimuat.`);
});


// --- Mulai Server ---
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log('Tekan CTRL + C untuk berhenti.');
});