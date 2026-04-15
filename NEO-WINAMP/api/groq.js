// Vercel Serverless Function — Groq AI Proxy
// API key is stored in Vercel Environment Variables (GROQ_API_KEY)
// Frontend calls /api/groq instead of hitting Groq directly

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages, max_tokens, temperature, model, useValeria, apiKey } = req.body;

    let keyToUse = process.env.GROQ_API_KEY;
    if (useValeria) {
        keyToUse = process.env.VALERIA_API_KEY || process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY;
    }
    // Backward compatibility for direct apiKey passing just in case
    if (apiKey) keyToUse = apiKey;

    if (!keyToUse) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${keyToUse}`
            },
            body: JSON.stringify({
                model: model || 'llama-3.3-70b-versatile',
                messages: messages || [],
                max_tokens: max_tokens || 120,
                temperature: temperature || 0.9
            })
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Groq proxy error:', error);
        return res.status(500).json({ error: 'Groq API failed' });
    }
}
