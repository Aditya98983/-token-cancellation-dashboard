const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8091;
const DATA_FILE = path.resolve(__dirname, '../data.json');
const PENDING_FILE = path.resolve(__dirname, '../pending-actions.json');

// --- Helpers ---

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readPending() {
  try {
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writePending(actions) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(actions, null, 2));
}

function addPendingAction(action) {
  const actions = readPending();
  actions.push(action);
  writePending(actions);
}

function getWorkingDaysSince(dateStr) {
  const start = new Date(dateStr);
  const now = new Date();
  let count = 0;
  const current = new Date(start);
  while (current < now) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// --- API: Follow-up on a ticket (instant) ---

app.post('/api/followup', (req, res) => {
  const { id, message } = req.body;
  const data = readData();
  const item = data.find(d => d.id === id);

  if (!item) return res.status(404).json({ error: 'Ticket not found' });

  const msg = message || `📋 *Follow-up: ${item.name}*\n\nHi team, this token cancellation request is pending. Could you please share an update on the current status and expected ETA?\n\n_Automated follow-up via Token Cancellation Tracker_`;

  addPendingAction({
    type: 'follow-up',
    threadTs: item.threadTs,
    message: msg,
    ticketId: item.id,
    createdAt: new Date().toISOString(),
  });

  item.status = 'follow-up';
  writeData(data);

  res.json({ ok: true, message: 'Follow-up queued for posting' });
});

// --- API: Close a ticket (instant) ---

app.post('/api/close', (req, res) => {
  const { id, message } = req.body;
  const data = readData();
  const item = data.find(d => d.id === id);

  if (!item) return res.status(404).json({ error: 'Ticket not found' });

  const msg = message || `✅ *Closed: ${item.name}*\n\nThis token cancellation request has been completed and marked as closed.\n\n_Closed via Token Cancellation Tracker_`;

  addPendingAction({
    type: 'close',
    threadTs: item.threadTs,
    message: msg,
    ticketId: item.id,
    createdAt: new Date().toISOString(),
  });

  item.status = 'completed';
  writeData(data);

  res.json({ ok: true, message: 'Closure queued for posting' });
});

// --- API: Delete a ticket ---

app.delete('/api/tickets/:id', (req, res) => {
  const id = parseInt(req.params.id);
  let data = readData();
  const item = data.find(d => d.id === id);
  if (!item) return res.status(404).json({ error: 'Ticket not found' });

  data = data.filter(d => d.id !== id);
  writeData(data);
  res.json({ ok: true, message: `Deleted: ${item.name}` });
});

// --- API: Create a new ticket ---

app.post('/api/tickets', (req, res) => {
  const { name, raisedBy, mid } = req.body;
  if (!name) return res.status(400).json({ error: 'Merchant name is required' });

  const data = readData();
  const nextId = data.length > 0 ? Math.max(...data.map(d => d.id)) + 1 : 1;
  const today = new Date().toISOString().split('T')[0];

  const newEntry = {
    id: nextId,
    name: name,
    raisedBy: raisedBy || 'Dashboard User',
    raisedDate: today,
    status: 'in-progress',
    threadTs: '',
    slackLink: '',
    mid: mid || '',
  };

  data.push(newEntry);
  writeData(data);

  res.json({ ok: true, ticket: newEntry });
});

// --- API: Get all tickets ---

app.get('/api/tickets', (req, res) => {
  const data = readData();
  const enriched = data.map(item => ({
    ...item,
    workingDays: getWorkingDaysSince(item.raisedDate),
    slaStatus: (() => {
      const days = getWorkingDaysSince(item.raisedDate);
      if (item.status === 'completed') return 'completed';
      if (days >= 20) return 'overdue';
      if (days >= 14) return 'critical';
      if (days >= 7) return 'follow-up-due';
      return 'on-track';
    })(),
  }));
  res.json(enriched);
});

// --- API: Get pending actions ---

app.get('/api/pending', (req, res) => {
  res.json(readPending());
});

// --- API: Clear pending actions (called after Claude processes them) ---

app.post('/api/pending/clear', (req, res) => {
  writePending([]);
  res.json({ ok: true });
});

// --- CRON: Auto follow-ups (weekdays at 10am IST) ---

cron.schedule('30 4 * * 1-5', () => {
  // 4:30 UTC = 10:00 IST
  console.log(`[${new Date().toISOString()}] Running auto follow-up check...`);
  const data = readData();
  let updated = false;

  for (const item of data) {
    if (item.status === 'completed') continue;
    if (!item.threadTs) continue;

    const days = getWorkingDaysSince(item.raisedDate);

    // Day 7 follow-up
    if (days === 7 && item.status === 'in-progress') {
      addPendingAction({
        type: 'follow-up',
        threadTs: item.threadTs,
        message: `📋 *7-Day Follow-up: ${item.name}*\n\nThis request was raised 7 working days ago. Please share a status update and ETA for completion.\n\n_Automated reminder — Token Cancellation Tracker_`,
        ticketId: item.id,
        createdAt: new Date().toISOString(),
        auto: true,
      });
      item.status = 'follow-up';
      updated = true;
      console.log(`  → Day 7 follow-up queued: ${item.name}`);
    }

    // Day 14 follow-up
    if (days === 14) {
      addPendingAction({
        type: 'follow-up',
        threadTs: item.threadTs,
        message: `⚠️ *14-Day Reminder: ${item.name}*\n\nThis request has been pending for 14 working days. SLA deadline (20 days) is approaching. Urgent attention required.\n\n_Automated reminder — Token Cancellation Tracker_`,
        ticketId: item.id,
        createdAt: new Date().toISOString(),
        auto: true,
      });
      updated = true;
      console.log(`  → Day 14 reminder queued: ${item.name}`);
    }

    // Day 20+ mark overdue
    if (days >= 20 && item.status !== 'completed' && item.status !== 'overdue') {
      item.status = 'overdue';
      updated = true;
      console.log(`  → Marked overdue: ${item.name}`);
    }
  }

  if (updated) writeData(data);
  console.log(`[${new Date().toISOString()}] Auto follow-up check complete.`);
});

// --- Health check ---

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    tickets: readData().length,
    pendingActions: readPending().length,
    time: new Date().toISOString(),
  });
});

// --- Serve the dashboard frontend too ---

app.use(express.static(path.resolve(__dirname, '..')));

// --- Start ---

app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🚀 Token Cancellation Tracker Backend');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Server:     http://localhost:${PORT}`);
  console.log(`  Dashboard:  http://localhost:${PORT}/index.html`);
  console.log(`  Health:     http://localhost:${PORT}/health`);
  console.log(`  API:        http://localhost:${PORT}/api/tickets`);
  console.log('');
  console.log('  ⏰ Auto follow-ups: Weekdays at 10:00am IST');
  console.log('  📋 Pending check:   Claude processes pending-actions.json');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
});
