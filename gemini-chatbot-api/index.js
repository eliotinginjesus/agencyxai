const express = require('express');
const app = express();
const port = 3000;
const dotenv = require('dotenv');
const cors = require('cors');
const {
  GoogleGenerativeAI,
} = require('@google/generative-ai');

const fs = require('fs');
const path = require('path');

// --- Middlewares ---
app.use(express.json());
// Menyajikan file dari folder 'public' (index.html, dll.)
app.use(express.static('public'));

// --- Inisialisasi Model AI ---
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash', // PERBAIKAN: Menggunakan nama model yang stabil
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
  console.error("Pastikan file 'products.json' ada di folder yang sama dengan 'index.js'");
  productDB = { products: [] }; // Default ke array kosong jika gagal
}

// <<< BARU: Ini adalah instruksi sistem permanen untuk AI
const SYSTEM_INSTRUCTION = `
Anda adalah asisten AI untuk "IGNite Digital Agency", sebuah agensi digital dengan layanan lengkap.
Tugas Anda adalah menjawab pertanyaan pelanggan HANYA berdasarkan informasi dalam "KONTEKS PRODUK" yang diberikan, yang berisi informasi tentang layanan seperti Desain, Marketing, dan Web Development.
- JANGAN mengarang harga, spesifikasi, atau informasi lain.
- Jika informasi tidak ada di konteks, jawab dengan sopan bahwa Anda tidak memiliki informasi tersebut atau akan menanyakannya ke tim.
- Jawab dengan ramah, profesional, dan to-the-point.
- Gunakan bahasa Indonesia.
`;

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
    // Hanya butuh 'message' dari frontend. 'systemInstruction' dari frontend akan diabaikan.
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    // --- <<< MODIFIKASI INTI: RAG DIMULAI DI SINI ---
    
    // 1. (Retrieval) Ambil data produk yang relevan berdasarkan pesan user
    const foundProducts = findRelevantProducts(message);

    // 2. (Augmentation) Siapkan "Konteks" untuk AI
    let context = "";
    if (foundProducts.length > 0) {
      context = JSON.stringify(foundProducts, null, 2);
    } else {
      context = "Tidak ada produk atau informasi yang relevan ditemukan di database.";
    }

    // 3. (Generation) Buat Prompt Final yang LENGKAP
    // Ini menggabungkan: Instruksi Sistem + Konteks dari RAG + Pesan User
    const finalPrompt = 
      SYSTEM_INSTRUCTION + 
      `\n--- KONTEKS PRODUK (HANYA GUNAKAN INFO INI) ---\n` +
      context +
      `\n--- AKHIR KONTEKS ---\n\n` +
      `User: ${message}\n` +
      `Assistant:`; // AI akan melanjutkan dari sini

    // --- RAG SELESAI ---

    // 4. Panggil model dengan prompt LENGKAP
    const result = await model.generateContent(finalPrompt);
    const response = result.response;
    const text = response.text();

    // 5. Kirim balasan ke user
    res.json({ text });

  } catch (error) {
    console.error('Error calling Generative AI:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Rute GET dasar untuk memeriksa status server
app.get('/', (req, res) => {
  res.send(`Server IGNite berjalan. API Key ditemukan: ${process.env.API_KEY ? 'Ya' : 'Tidak'}. Database Produk: ${productDB.products.length} item dimuat.`);
});


// --- Mulai Server ---
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log('Tekan CTRL + C untuk berhenti.');
});