// server/src/app.js
// Builds the Express app. Kept separate from server.js so tests can use it without opening a port.
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import requestRoutes from './routes/requests.js';
import userRoutes from './routes/users.js';
import policyRoutes from './routes/policy.js';
import reportRoutes from './routes/reports.js';
import attachmentRoutes from './routes/attachments.js';
import config from './config.js';

const app = express();
app.set('trust proxy', config.trustProxy);

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(authenticate);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/attachments', attachmentRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Malformed JSON bodies get a 400; anything else unexpected is logged and hidden from the client
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That is too large. Files can be at most 5 MB.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

export default app;
