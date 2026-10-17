// server/src/app.js
// Builds the Express app. Kept separate from server.js so tests can use it without opening a port.
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import requestRoutes from './routes/requests.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(authenticate);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Malformed JSON bodies get a 400; anything else unexpected is logged and hidden from the client
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

export default app;
