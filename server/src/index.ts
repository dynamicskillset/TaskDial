import dotenv from 'dotenv';
import path from 'path';

// Load .env before anything else
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import { getDb, closeDb } from './db';
import { authMiddleware } from './middleware/auth';
import tasksRouter from './routes/tasks';
import pomodoroRouter from './routes/pomodoro';
import settingsRouter from './routes/settings';
import syncRouter from './routes/sync';
import calendarRouter from './routes/calendar';
import recurrenceRouter from './routes/recurrence';
import analyticsRouter from './routes/analytics';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth middleware for all /api routes
app.use('/api', authMiddleware);

// Routes
app.use('/api/tasks', tasksRouter);
app.use('/api/pomodoro', pomodoroRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/recurrence', recurrenceRouter);
app.use('/api/analytics', analyticsRouter);

// Serve frontend static files (fallback when not behind Caddy/nginx)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Initialise database
getDb();
console.log('Database initialised');

// Start server
const server = app.listen(PORT, () => {
  console.log(`ChronoTasker server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  server.close(() => {
    closeDb();
    console.log('Server stopped');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
