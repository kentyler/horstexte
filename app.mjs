// app.mjs - Main application file
import express from 'express';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize PostgreSQL connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT
});
const index = pinecone.index(process.env.PINECONE_INDEX);

// Create a new prompt
app.post('/api/prompts', async (req, res) => {
  try {
    const { text, title } = req.body;
    const id = uuidv4();
    
    // Store in PostgreSQL
    await pool.query(
      'INSERT INTO blocks (id, block_type, title, content) VALUES ($1, $2, $3, $4)',
      [id, 'prompt', title, JSON.stringify({ text })]
    );
    
    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    const embedding = embeddingResponse.data[0].embedding;
    
    // Store in Pinecone
    await index.upsert([{
      id,
      values: embedding,
      metadata: {
        prompt_id: id,
        title
      }
    }]);
    
    res.status(201).json({ id, title, text });
  } catch (error) {
    console.error('Error creating prompt:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// Create a response to a prompt
app.post('/api/prompts/:promptId/responses', async (req, res) => {
  try {
    const { promptId } = req.params;
    const { text } = req.body;
    const id = uuidv4();
    
    // Store response in PostgreSQL
    await pool.query(
      'INSERT INTO blocks (id, block_type, content) VALUES ($1, $2, $3)',
      [id, 'response', JSON.stringify({ text })]
    );
    
    // Create relationship
    await pool.query(
      'INSERT INTO block_relations (source_block_id, target_block_id, relation_type) VALUES ($1, $2, $3)',
      [id, promptId, 'response_to']
    );
    
    res.status(201).json({ id, promptId, text });
  } catch (error) {
    console.error('Error creating response:', error);
    res.status(500).json({ error: 'Failed to create response' });
  }
});

// Get a prompt and its responses
app.get('/api/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the prompt
    const promptResult = await pool.query(
      'SELECT * FROM blocks WHERE id = $1',
      [id]
    );
    
    if (promptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    const prompt = promptResult.rows[0];
    
    // Get related responses
    const responsesResult = await pool.query(`
      SELECT b.* 
      FROM blocks b
      JOIN block_relations br ON br.source_block_id = b.id
      WHERE br.target_block_id = $1 AND br.relation_type = 'response_to'
    `, [id]);
    
    const responses = responsesResult.rows;
    
    res.json({
      prompt,
      responses
    });
  } catch (error) {
    console.error('Error retrieving prompt:', error);
    res.status(500).json({ error: 'Failed to retrieve prompt' });
  }
});

// Search for similar prompts
app.post('/api/prompts/search', async (req, res) => {
  try {
    const { text, limit = 5 } = req.body;
    
    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    const embedding = embeddingResponse.data[0].embedding;
    
    // Query Pinecone
    const queryResponse = await index.query({
      vector: embedding,
      topK: limit,
      includeMetadata: true
    });
    
    // Get full prompt data from PostgreSQL
    const ids = queryResponse.matches.map(match => match.id);
    
    if (ids.length === 0) {
      return res.json({ prompts: [] });
    }
    
    const promptsResult = await pool.query(
      `SELECT * FROM blocks WHERE id = ANY($1)`,
      [ids]
    );
    
    res.json({
      prompts: promptsResult.rows
    });
  } catch (error) {
    console.error('Error searching prompts:', error);
    res.status(500).json({ error: 'Failed to search prompts' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;