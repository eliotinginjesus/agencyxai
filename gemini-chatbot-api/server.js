require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static('public'));

// Initialize the Gemini AI model
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Define the /api/chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemInstruction } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const chat = model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 1000,
      },
      // Use the system instruction provided by the frontend
      systemInstruction: systemInstruction || 'You are a helpful assistant.',
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();

    res.json({ text });

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log('Serving static files from "public" directory.');
  console.log('API Key loaded successfully.');
});