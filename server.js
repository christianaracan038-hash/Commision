const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'hotel.db');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(DB_FILE);
const sessions = {};

function runDb(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allDb(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getDb(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function seedDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT,
      department TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE,
      type TEXT,
      rate REAL,
      status TEXT,
      housekeeping_status TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      guest_name TEXT,
      contact TEXT,
      checkin_datetime TEXT,
      food_order TEXT,
      serve_time TEXT,
      status TEXT,
      updated INTEGER DEFAULT 0,
      created_at TEXT,
      checked_out INTEGER DEFAULT 0,
      FOREIGN KEY(room_id) REFERENCES rooms(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      room_number TEXT,
      food_order TEXT,
      serve_time TEXT,
      status TEXT,
      updated INTEGER DEFAULT 0,
      delivered_at TEXT,
      created_at TEXT,
      FOREIGN KEY(booking_id) REFERENCES bookings(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      room_number TEXT,
      guest_name TEXT,
      room_rate REAL,
      food_amount REAL,
      total REAL,
      created_at TEXT,
      FOREIGN KEY(booking_id) REFERENCES bookings(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT,
      amount REAL,
      type TEXT,
      created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT,
      status TEXT,
      created_at TEXT
    )`);

    db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
      if (err) throw err;
      if (row.count === 0) {
        const users = [
          ['Admin Front Desk', 'admin@hotel.com', 'password', 'admin', 'Front Desk'],
          ['Food & Beverage', 'food@hotel.com', 'password', 'food-beverage', 'Food & Beverage'],
          ['Accounting', 'accounting@hotel.com', 'password', 'accounting', 'Accounting'],
          ['Housekeeping', 'housekeeping@hotel.com', 'password', 'housekeeping', 'Housekeeping']
        ];
        const stmt = db.prepare('INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)');
        for (const user of users) stmt.run(user);
        stmt.finalize();
      }
    });

    db.get('SELECT COUNT(*) AS count FROM rooms', (err, row) => {
      if (err) throw err;
      if (row.count === 0) {
        const rooms = [
          ['101', 'Single', 250, 'available', 'Ready'],
          ['102', 'Single', 250, 'available', 'Ready'],
          ['103', 'Double', 350, 'available', 'Ready'],
          ['104', 'Deluxe', 500, 'available', 'Ready'],
          ['105', 'Suite', 800, 'available', 'Ready']
        ];
        const stmt = db.prepare('INSERT INTO rooms (number, type, rate, status, housekeeping_status) VALUES (?, ?, ?, ?, ?)');
        for (const room of rooms) stmt.run(room);
        stmt.finalize();
      }
    });
  });
}

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = sessions[token];
  next();
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    const user = await getDb('SELECT id, name, email, role, department FROM users WHERE email = ? AND password = ?', [email, password]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions[token] = user;
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const role = req.user.role;
  try {
    const stats = {};
    if (role === 'admin') {
      const roomCount = await getDb('SELECT COUNT(*) AS count FROM rooms');
      const occupiedCount = await getDb("SELECT COUNT(*) AS count FROM bookings WHERE status = 'occupied'");
      const foodOrdersCount = await getDb("SELECT COUNT(*) AS count FROM orders WHERE status != 'delivered'");
      stats.overview = {
        rooms: roomCount.count,
        occupied: occupiedCount.count,
        pendingFoodOrders: foodOrdersCount.count
      };
    } else if (role === 'food-beverage') {
      const pendingOrders = await getDb("SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending', 'prepared')");
      stats.overview = { pendingOrders: pendingOrders.count };
    } else if (role === 'accounting') {
      const receipts = await getDb('SELECT COUNT(*) AS count FROM receipts');
      const ledgerEntries = await getDb('SELECT COUNT(*) AS count FROM ledger');
      stats.overview = { receipts: receipts.count, ledgerEntries: ledgerEntries.count };
    } else if (role === 'housekeeping') {
      const tasks = await getDb("SELECT COUNT(*) AS count FROM housekeeping_tasks WHERE status = 'needs-cleaning'");
      stats.overview = { roomsToClean: tasks.count };
    }
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Unable to load dashboard.' });
  }
});

app.get('/api/rooms/available', requireAuth, async (req, res) => {
  const rooms = await allDb('SELECT id, number, type, rate, housekeeping_status FROM rooms WHERE status = ? ORDER BY number', ['available']);
  res.json({ rooms });
});

app.get('/api/rooms/occupied', requireAuth, async (req, res) => {
  const bookings = await allDb(`SELECT b.id, r.number AS room_number, r.rate, b.guest_name, b.contact, b.checkin_datetime, b.food_order, b.serve_time, b.updated, b.status
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    WHERE b.status = 'occupied' AND b.checked_out = 0
    ORDER BY r.number`);
  res.json({ bookings });
});

app.get('/api/rooms/food-orders', requireAuth, async (req, res) => {
  const orders = await allDb(`SELECT o.id, o.room_number, o.food_order, o.serve_time, o.status, o.updated, b.guest_name
    FROM orders o
    LEFT JOIN bookings b ON o.booking_id = b.id
    WHERE o.status != 'delivered'
    ORDER BY o.room_number`);
  res.json({ orders });
});

app.post('/api/rooms/book', requireAuth, async (req, res) => {
  const { roomId, guest_name, contact, checkin_datetime, food_order, serve_time } = req.body;
  if (!roomId || !guest_name || !contact || !checkin_datetime) {
    return res.status(400).json({ error: 'Missing booking information.' });
  }
  try {
    const room = await getDb('SELECT rate, number FROM rooms WHERE id = ?', [roomId]);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    await runDb('UPDATE rooms SET status = ? WHERE id = ?', ['occupied', roomId]);
    const booking = await runDb(`INSERT INTO bookings (room_id, guest_name, contact, checkin_datetime, food_order, serve_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'occupied', datetime('now'))`, [roomId, guest_name, contact, checkin_datetime, food_order || '', serve_time || '']);
    const bookingId = booking.lastID;
    if (food_order) {
      await runDb(`INSERT INTO orders (booking_id, room_number, food_order, serve_time, status, created_at) VALUES (?, ?, ?, ?, 'pending', datetime('now'))`, [bookingId, room.number, food_order, serve_time || '']);
    }
    res.json({ message: 'Room confirmed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Unable to confirm booking.' });
  }
});

app.post('/api/rooms/update-order', requireAuth, async (req, res) => {
  const { bookingId, food_order, serve_time } = req.body;
  if (!bookingId || !food_order) return res.status(400).json({ error: 'Booking and food order are required.' });
  try {
    const booking = await getDb('SELECT id, room_id FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    await runDb('UPDATE bookings SET food_order = ?, serve_time = ?, updated = 1 WHERE id = ?', [food_order, serve_time || '', bookingId]);
    const room = await getDb('SELECT number FROM rooms WHERE id = ?', [booking.room_id]);
    await runDb(`INSERT INTO orders (booking_id, room_number, food_order, serve_time, status, updated, created_at) VALUES (?, ?, ?, ?, 'pending', 1, datetime('now'))`, [bookingId, room.number, food_order, serve_time || '']);
    res.json({ message: 'Food order updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Unable to update order.' });
  }
});

app.get('/api/billing/occupied', requireAuth, async (req, res) => {
  const bookings = await allDb(`SELECT b.id, r.number AS room_number, r.rate, b.guest_name, b.contact, b.checkin_datetime, b.food_order, b.serve_time
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    WHERE b.checked_out = 0 AND b.status = 'occupied'
    ORDER BY r.number`);
  res.json({ bookings });
});

app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId) return res.status(400).json({ error: 'Booking id is required.' });
  try {
    const booking = await getDb(`SELECT b.id, b.room_id, b.food_order, b.serve_time, r.number AS room_number, r.rate, b.guest_name
      FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.id = ?`, [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const foodAmount = booking.food_order ? 150 : 0;
    const total = booking.rate + foodAmount;
    await runDb('UPDATE bookings SET checked_out = 1 WHERE id = ?', [bookingId]);
    await runDb('UPDATE rooms SET status = ?, housekeeping_status = ? WHERE id = ?', ['available', 'Needs Cleaning', booking.room_id]);
    await runDb(`INSERT INTO receipts (booking_id, room_number, guest_name, room_rate, food_amount, total, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`, [booking.id, booking.room_number, booking.guest_name, booking.rate, foodAmount, total]);
    await runDb(`INSERT INTO ledger (description, amount, type, created_at) VALUES (?, ?, 'credit', datetime('now'))`, [`Checkout for room ${booking.room_number}`, total]);
    await runDb(`INSERT INTO housekeeping_tasks (room_number, status, created_at) VALUES (?, 'needs-cleaning', datetime('now'))`, [booking.room_number]);
    res.json({ message: 'Checkout complete.', receipt: { room_number: booking.room_number, guest_name: booking.guest_name, room_rate: booking.rate, food_amount: foodAmount, total } });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed.' });
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  const orders = await allDb(`SELECT o.id, o.room_number, o.food_order, o.serve_time, o.status, o.updated, o.created_at, b.guest_name
    FROM orders o
    LEFT JOIN bookings b ON o.booking_id = b.id
    ORDER BY o.created_at DESC`);
  res.json({ orders });
});

app.post('/api/orders/deliver', requireAuth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Order id is required.' });
  try {
    await runDb("UPDATE orders SET status = ?, delivered_at = datetime('now') WHERE id = ?", ['delivered', orderId]);
    res.json({ message: 'Order marked delivered.' });
  } catch (err) {
    res.status(500).json({ error: 'Unable to update order status.' });
  }
});

app.get('/api/receipts', requireAuth, async (req, res) => {
  const receipts = await allDb('SELECT id, room_number, guest_name, room_rate, food_amount, total, created_at FROM receipts ORDER BY created_at DESC');
  res.json({ receipts });
});

app.get('/api/ledger', requireAuth, async (req, res) => {
  const ledger = await allDb('SELECT id, description, amount, type, created_at FROM ledger ORDER BY created_at DESC');
  res.json({ ledger });
});

app.get('/api/housekeeping/tasks', requireAuth, async (req, res) => {
  const tasks = await allDb('SELECT id, room_number, status FROM housekeeping_tasks ORDER BY created_at DESC');
  res.json({ tasks });
});

app.post('/api/housekeeping/ready', requireAuth, async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ error: 'Task id is required.' });
  try {
    const task = await getDb('SELECT room_number FROM housekeeping_tasks WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    await runDb('UPDATE housekeeping_tasks SET status = ? WHERE id = ?', ['ready', taskId]);
    await runDb('UPDATE rooms SET housekeeping_status = ? WHERE number = ?', ['Ready', task.room_number]);
    res.json({ message: 'Housekeeping updated to Ready.' });
  } catch (err) {
    res.status(500).json({ error: 'Unable to update housekeeping task.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

seedDatabase();

app.listen(PORT, () => {
  console.log(`Hotel management system running at http://localhost:${PORT}`);
});
