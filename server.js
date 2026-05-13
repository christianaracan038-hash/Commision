const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "hotel.db");

// app.use(cors());
// app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

    db.run(`ALTER TABLE bookings ADD COLUMN id_filename TEXT`, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("ALTER TABLE bookings error:", err.message);
      }
    });

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

    db.run(`ALTER TABLE receipts ADD COLUMN receipt_number TEXT`, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("ALTER TABLE receipts error:", err.message);
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      description TEXT,
      amount REAL,
      type TEXT,
      guest_name TEXT,
      room_number TEXT,
      created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT,
      status TEXT,
      created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price REAL
    )`);

    // =========================================
    // EXPENSE MANAGEMENT TABLES
    // =========================================

    db.run(`CREATE TABLE IF NOT EXISTS expense_categories (
      category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      expense_id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      expense_name TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      payment_method TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (category_id) REFERENCES expense_categories(category_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inventory_expense_details (
      inventory_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(expense_id),
      FOREIGN KEY (item_id) REFERENCES inventory_items(item_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS operating_expense_details (
      operating_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      bill_type TEXT,
      billing_period TEXT,
      provider TEXT,
      FOREIGN KEY (expense_id) REFERENCES expenses(expense_id)
    )`);

    db.get("SELECT COUNT(*) AS count FROM expense_categories", (err, row) => {
      if (err) {
        console.error("Seed expense_categories error:", err);
        return;
      }
      if (row.count === 0) {
        const categories = [["Inventory Expense"], ["Operating Expense"]];
        const stmt = db.prepare(
          "INSERT INTO expense_categories (category_name) VALUES (?)",
        );
        for (const category of categories) stmt.run(category);
        stmt.finalize();
      }
    });

    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
      if (err) throw err;
      if (row.count === 0) {
        const users = [
          [
            "Admin Front Desk",
            "admin@hotel.com",
            "password",
            "admin",
            "Front Desk",
          ],
          [
            "Food & Beverage",
            "food@hotel.com",
            "password",
            "food-beverage",
            "Food & Beverage",
          ],
          [
            "Accounting",
            "accounting@hotel.com",
            "password",
            "accounting",
            "Accounting",
          ],
          [
            "Housekeeping",
            "housekeeping@hotel.com",
            "password",
            "housekeeping",
            "Housekeeping",
          ],
        ];
        const stmt = db.prepare(
          "INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)",
        );
        for (const user of users) stmt.run(user);
        stmt.finalize();
      }
    });

    db.get("SELECT COUNT(*) AS count FROM rooms", (err, row) => {
      if (err) throw err;
      if (row.count === 0) {
        const rooms = [
          ["101", "STANDARD MATRIMONIAL", 1200, "available", "Ready"],
          ["102", "TWIN MATRIMONIAL", 1500, "available", "Ready"],
          ["103", "DELUXE TWIN MATRIMONIAL", 2100, "available", "Ready"],
          ["104", "2 EXTRA MATTRESS", 300, "available", "Ready"],
          ["105", "STANDARD MATRIMONIAL", 1500, "available", "Ready"],
          ["106", "TWIN MATRIMONIAL", 1800, "available", "Ready"],
          ["107", "DELUXE ROOM", 2100, "available", "Ready"],
          ["108", "2 EXTRA MATTRESSES", 1500, "available", "Ready"],
        ];
        const stmt = db.prepare(
          "INSERT INTO rooms (number, type, rate, status, housekeeping_status) VALUES (?, ?, ?, ?, ?)",
        );
        for (const room of rooms) stmt.run(room);
        stmt.finalize();
      }
    });

    db.get("SELECT COUNT(*) AS count FROM menu", (err, row) => {
      if (err) throw err;
      if (row.count === 0) {
        const menuItems = [["Grilled Chicken", 250]];
        const stmt = db.prepare("INSERT INTO menu (name, price) VALUES (?, ?)");
        for (const item of menuItems) stmt.run(item);
        stmt.finalize();
      }
    });
  });
}

function requireAuth(req, res, next) {
  const token = req.headers["x-session-token"];
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = sessions[token];
  next();
}

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });
  try {
    const user = await getDb(
      "SELECT id, name, email, role, department FROM users WHERE email = ? AND password = ?",
      [email, password],
    );
    if (!user) return res.status(401).json({ error: "Invalid credentials." });
    const token = crypto.randomBytes(24).toString("hex");
    sessions[token] = user;
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/user", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/menu", requireAuth, async (req, res) => {
  try {
    const items = await allDb("SELECT id, name, price FROM menu ORDER BY name");
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "Unable to load menu." });
  }
});
app.delete("/api/menu/:id", requireAuth, async (req, res) => {
  try {
    await runDb("DELETE FROM menu WHERE id = ?", [req.params.id]);
    res.json({ message: "Item deleted." });
  } catch (err) {
    res.status(500).json({ error: "Delete failed." });
  }
});

app.put("/api/menu/:id", requireAuth, async (req, res) => {
  const { name, price } = req.body;

  try {
    await runDb("UPDATE menu SET name = ?, price = ? WHERE id = ?", [
      name,
      price,
      req.params.id,
    ]);

    res.json({ message: "Menu updated." });
  } catch (err) {
    res.status(500).json({ error: "Update failed." });
  }
});

app.post("/api/menu", requireAuth, async (req, res) => {
  const { name, price } = req.body;

  if (!name || !price)
    return res.status(400).json({ error: "Name and price required." });

  try {
    await runDb("INSERT INTO menu (name, price) VALUES (?, ?)", [name, price]);
    res.json({ message: "Menu item added." });
  } catch (err) {
    res.status(500).json({ error: "Failed to add item." });
  }
});

app.get("/api/room-rates", requireAuth, async (req, res) => {
  try {
    const rates = await allDb(
      "SELECT id, number, rate FROM rooms ORDER BY number",
    );
    res.json({ rates });
  } catch (err) {
    res.status(500).json({ error: "Unable to load room rates." });
  }
});

app.get("/api/rooms/available", requireAuth, async (req, res) => {
  const rooms = await allDb(
    "SELECT id, number, type, rate, housekeeping_status FROM rooms WHERE status = ? ORDER BY number",
    ["available"],
  );
  res.json({ rooms });
});

app.get("/api/rooms/occupied", requireAuth, async (req, res) => {
  const bookings =
    await allDb(`SELECT b.id, r.number AS room_number, r.rate, b.guest_name, b.contact, b.checkin_datetime, b.food_order, b.serve_time, b.updated, b.status
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    WHERE b.status = 'occupied' AND b.checked_out = 0
    ORDER BY r.number`);
  res.json({ bookings });
});

app.get("/api/rooms/food-orders", requireAuth, async (req, res) => {
  const orders =
    await allDb(`SELECT o.id, o.room_number, o.food_order, o.serve_time, o.status, o.updated, b.guest_name
    FROM orders o
    LEFT JOIN bookings b ON o.booking_id = b.id
    WHERE o.status != 'delivered'
    ORDER BY o.room_number`);
  res.json({ orders });
});

app.post("/api/rooms/book", requireAuth, async (req, res) => {
  const {
    roomId,
    guest_name,
    contact,
    checkin_datetime,
    food_order,
    serve_time,
  } = req.body;
  if (!roomId || !guest_name || !contact || !checkin_datetime) {
    return res.status(400).json({ error: "Missing booking information." });
  }
  try {
    const room = await getDb("SELECT rate, number FROM rooms WHERE id = ?", [
      roomId,
    ]);
    if (!room) return res.status(404).json({ error: "Room not found." });
    await runDb("UPDATE rooms SET status = ? WHERE id = ?", [
      "occupied",
      roomId,
    ]);
    const booking = await runDb(
      `INSERT INTO bookings (room_id, guest_name, contact, checkin_datetime, food_order, serve_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'occupied', datetime('now'))`,
      [
        roomId,
        guest_name,
        contact,
        checkin_datetime,
        food_order || "",
        serve_time || "",
      ],
    );
    const bookingId = booking.lastID;
    if (food_order) {
      await runDb(
        `INSERT INTO orders (booking_id, room_number, food_order, serve_time, status, created_at) VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
        [bookingId, room.number, food_order, serve_time || ""],
      );
    }

    if (req.body.valid_id && req.body.valid_id.data) {
      try {
        const fs = require("fs");
        const path = require("path");

        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, "uploads", "ids");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const idData = req.body.valid_id;
        const ext =
          idData.type === "application/pdf"
            ? "pdf"
            : idData.filename.split(".").pop();
        const filename = `booking_${bookingId}_${Date.now()}.${ext}`;
        const filepath = path.join(uploadsDir, filename);

        // Decode base64 and save file
        const buffer = Buffer.from(idData.data, "base64");
        fs.writeFileSync(filepath, buffer);

        // Save filename to bookings table
        await runDb("UPDATE bookings SET id_filename = ? WHERE id = ?", [
          filename,
          bookingId,
        ]);

        console.log(`✅ ID file saved: ${filename}`);
      } catch (fileErr) {
        console.error("⚠️ Failed to save ID file:", fileErr.message);
        // Don't fail the booking if file save fails
      }
    }

    // ── NEW: Record ledger charge entry ──────────────────────────
    // ── NEW: Record ledger charge + optional initial payment ──────
    try {
      const chargeDescription = food_order ? "Room + Food" : "Room Only";
      console.log("📦 Full req.body:", req.body);
      console.log("💰 initial_payment value:", req.body.initial_payment);

      let foodAmount = 0;
      if (food_order) {
        const items = food_order.split(",");
        for (let item of items) {
          item = item.trim();
          const match = item.match(/^(.+)\s+x(\d+)$/);
          if (match) {
            const name = match[1].trim();
            const qty = parseInt(match[2]);
            const menuItem = await getDb(
              "SELECT price FROM menu WHERE name = ?",
              [name],
            );
            if (menuItem) foodAmount += menuItem.price * qty;
          }
        }
      }

      const chargeAmount = room.rate + foodAmount;

      // Insert charge entry
      await runDb(
        `INSERT INTO ledger (booking_id, description, amount, type, guest_name, room_number, created_at)
     VALUES (?, ?, ?, 'charge', ?, ?, datetime('now'))`,
        [bookingId, chargeDescription, chargeAmount, guest_name, room.number],
      );

      // If initial payment was provided, insert credit entry too
      const initial_payment = parseFloat(req.body.initial_payment) || 0;
      if (initial_payment > 0) {
        const isFullPayment = initial_payment >= chargeAmount;
        const paymentDescription = isFullPayment
          ? "Payment"
          : "Partial Payment";

        await runDb(
          `INSERT INTO ledger (booking_id, description, amount, type, guest_name, room_number, created_at)
       VALUES (?, ?, ?, 'credit', ?, ?, datetime('now'))`,
          [
            bookingId,
            paymentDescription,
            initial_payment,
            guest_name,
            room.number,
          ],
        );
      }
    } catch (ledgerErr) {
      console.error(
        "⚠️ Ledger insert failed (booking still saved):",
        ledgerErr,
      );
    }
    // ─────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────

    res.json({ message: "Room confirmed successfully." });
  } catch (err) {
    console.error("❌ /rooms/book crashed:", err.message, err.stack);
    res.status(500).json({ error: "Unable to confirm booking." });
  }
});

app.post("/api/rooms/update-order", requireAuth, async (req, res) => {
  const { bookingId, food_order, serve_time } = req.body;
  if (!bookingId || !food_order)
    return res
      .status(400)
      .json({ error: "Booking and food order are required." });
  try {
    const booking = await getDb(
      "SELECT id, room_id FROM bookings WHERE id = ?",
      [bookingId],
    );
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    await runDb(
      "UPDATE bookings SET food_order = ?, serve_time = ?, updated = 1 WHERE id = ?",
      [food_order, serve_time || "", bookingId],
    );
    const room = await getDb("SELECT number FROM rooms WHERE id = ?", [
      booking.room_id,
    ]);
    await runDb(
      `INSERT INTO orders (booking_id, room_number, food_order, serve_time, status, updated, created_at) VALUES (?, ?, ?, ?, 'pending', 1, datetime('now'))`,
      [bookingId, room.number, food_order, serve_time || ""],
    );
    res.json({ message: "Food order updated." });
  } catch (err) {
    res.status(500).json({ error: "Unable to update order." });
  }
});

app.get("/api/billing/occupied", requireAuth, async (req, res) => {
  const bookings =
    await allDb(`SELECT b.id, r.number AS room_number, r.rate, b.guest_name, b.contact, b.checkin_datetime, b.food_order, b.serve_time
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    WHERE b.checked_out = 0 AND b.status = 'occupied'
    ORDER BY r.number`);
  res.json({ bookings });
});

app.post("/api/billing/checkout", requireAuth, async (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId)
    return res.status(400).json({ error: "Booking id is required." });
  try {
    const booking = await getDb(
      `SELECT b.id, b.room_id, b.food_order, b.serve_time, r.number AS room_number, r.rate, b.guest_name
      FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.id = ?`,
      [bookingId],
    );
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    let foodAmount = 0;
    let foodBreakdown = [];

    if (booking.food_order) {
      const items = booking.food_order.split(",");

      for (let item of items) {
        item = item.trim();

        // Example: "Chicken Joy x2"
        let [name, qty] = item.split("x");

        name = name.trim();
        qty = qty ? parseInt(qty.trim()) : 1;

        // Get price from menu table
        const menuItem = await getDb("SELECT price FROM menu WHERE name = ?", [
          name,
        ]);

        if (menuItem) {
          const total = menuItem.price * qty;
          foodAmount += total;

          foodBreakdown.push({
            name,
            qty,
            price: menuItem.price,
            total,
          });
        }
      }
    }
    const total = booking.rate + foodAmount;
    await runDb("UPDATE bookings SET checked_out = 1 WHERE id = ?", [
      bookingId,
    ]);
    await runDb(
      "UPDATE rooms SET status = ?, housekeeping_status = ? WHERE id = ?",
      ["available", "Needs Cleaning", booking.room_id],
    );

    const lastReceipt = await getDb(
      `SELECT receipt_number FROM receipts ORDER BY id DESC LIMIT 1`,
    );
    let nextNumber = 1;
    if (lastReceipt && lastReceipt.receipt_number) {
      const lastNum = parseInt(lastReceipt.receipt_number.replace("REC-", ""));
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const receipt_number = `REC-${String(nextNumber).padStart(4, "0")}`;
    await runDb(
      `INSERT INTO receipts (receipt_number, booking_id, room_number, guest_name, room_rate, food_amount, total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        receipt_number,
        booking.id,
        booking.room_number,
        booking.guest_name,
        booking.rate,
        foodAmount,
        total,
      ],
    );
    // await runDb(
    //   `INSERT INTO ledger (description, amount, type, guest_name, room_number, created_at)
    //   VALUES (?, ?, 'credit', ?, ?, datetime('now'))`,
    //   [
    //     `Checkout for room ${booking.room_number}`,
    //     total,
    //     booking.guest_name,
    //     booking.room_number,
    //   ],
    // );
    await runDb(
      `INSERT INTO housekeeping_tasks (room_number, status, created_at) VALUES (?, 'needs-cleaning', datetime('now'))`,
      [booking.room_number],
    );

    // Get payment history for this booking
    const payments = await allDb(
      `SELECT description, amount FROM ledger WHERE booking_id = ? AND type = 'credit' ORDER BY created_at ASC`,
      [bookingId],
    );
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const change = Math.max(0, totalPaid - total);

    res.json({
      message: "Checkout complete.",
      receipt: {
        receipt_number,
        room_number: booking.room_number,
        guest_name: booking.guest_name,
        room_rate: booking.rate,
        food_amount: foodAmount,
        food_items: foodBreakdown,
        total,
        payments,
        total_paid: totalPaid,
        change,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Checkout failed." });
  }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  const orders =
    await allDb(`SELECT o.id, o.room_number, o.food_order, o.serve_time, o.status, o.updated, o.created_at, b.guest_name
    FROM orders o
    LEFT JOIN bookings b ON o.booking_id = b.id
    ORDER BY o.created_at DESC`);
  res.json({ orders });
});

app.post("/api/orders/deliver", requireAuth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "Order id is required." });
  try {
    await runDb(
      "UPDATE orders SET status = ?, delivered_at = datetime('now') WHERE id = ?",
      ["delivered", orderId],
    );
    res.json({ message: "Order marked delivered." });
  } catch (err) {
    res.status(500).json({ error: "Unable to update order status." });
  }
});

app.get("/api/receipts", requireAuth, async (req, res) => {
  const receipts = await allDb(
    "SELECT id, receipt_number, room_number, guest_name, room_rate, food_amount, total, created_at FROM receipts ORDER BY created_at DESC",
  );
  res.json({ receipts });
});

app.post("/api/ledger/payment", requireAuth, async (req, res) => {
  const { bookingId, amount, guest_name, room_number } = req.body;

  if (!bookingId || !amount || !guest_name || !room_number) {
    return res.status(400).json({ error: "Missing payment information." });
  }

  try {
    // Get total charged for this booking
    const chargeRow = await getDb(
      `SELECT SUM(amount) AS total FROM ledger WHERE booking_id = ? AND type = 'charge'`,
      [bookingId],
    );
    // Get total already paid for this booking
    const paidRow = await getDb(
      `SELECT SUM(amount) AS total FROM ledger WHERE booking_id = ? AND type = 'credit'`,
      [bookingId],
    );

    const totalCharged = chargeRow?.total || 0;
    const totalPaid = (paidRow?.total || 0) + parseFloat(amount);
    const remaining = totalCharged - totalPaid;

    // Determine description
    let description;
    if (remaining <= 0) {
      // Check if there was a previous partial payment
      const prevPayment = await getDb(
        `SELECT id FROM ledger WHERE booking_id = ? AND type = 'credit'`,
        [bookingId],
      );
      description = prevPayment ? "Final Payment" : "Payment";
    } else {
      description = "Partial Payment";
    }

    await runDb(
      `INSERT INTO ledger (booking_id, description, amount, type, guest_name, room_number, created_at)
       VALUES (?, ?, ?, 'credit', ?, ?, datetime('now'))`,
      [bookingId, description, parseFloat(amount), guest_name, room_number],
    );

    res.json({
      message: "Payment recorded.",
      description,
      remaining: Math.max(0, remaining),
    });
  } catch (err) {
    console.error("Payment recording failed:", err);
    res.status(500).json({ error: "Failed to record payment." });
  }
});

// app.get("/api/ledger", requireAuth, async (req, res) => {
//   const ledger = await allDb(
//     "SELECT id, description, guest_name,  amount, type, room_number, created_at FROM ledger ORDER BY created_at DESC",
//   );
//   res.json({ ledger });
// });

app.get("/api/ledger", requireAuth, async (req, res) => {
  try {
    const ledger = await allDb(
      `SELECT id, booking_id, description, guest_name, amount, type, room_number, created_at
       FROM ledger
       WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
       ORDER BY created_at ASC`,
    );
    res.json({ ledger });
  } catch (err) {
    res.status(500).json({ error: "Failed to load ledger." });
  }
});

app.get("/api/housekeeping/tasks", requireAuth, async (req, res) => {
  const tasks = await allDb(
    "SELECT id, room_number, status FROM housekeeping_tasks ORDER BY created_at DESC",
  );
  res.json({ tasks });
});

app.post("/api/housekeeping/ready", requireAuth, async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ error: "Task id is required." });
  try {
    const task = await getDb(
      "SELECT room_number FROM housekeeping_tasks WHERE id = ?",
      [taskId],
    );
    if (!task) return res.status(404).json({ error: "Task not found." });
    await runDb("UPDATE housekeeping_tasks SET status = ? WHERE id = ?", [
      "ready",
      taskId,
    ]);
    await runDb("UPDATE rooms SET housekeeping_status = ? WHERE number = ?", [
      "Ready",
      task.room_number,
    ]);
    res.json({ message: "Housekeeping updated to Ready." });
  } catch (err) {
    res.status(500).json({ error: "Unable to update housekeeping task." });
  }
});

app.get("/api/ledger/balance/:bookingId", requireAuth, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const chargeRow = await getDb(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger WHERE booking_id = ? AND type = 'charge'`,
      [bookingId],
    );
    const creditRow = await getDb(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger WHERE booking_id = ? AND type = 'credit'`,
      [bookingId],
    );

    const totalCharged = chargeRow?.total || 0;
    const totalPaid = creditRow?.total || 0;
    const remaining = Math.max(0, totalCharged - totalPaid);

    res.json({ totalCharged, totalPaid, remaining });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch balance." });
  }
});

// ── EXPENSE MANAGEMENT ROUTES ────────────────────────────────────
// Expense Categories
app.get("/api/expense-categories", requireAuth, async (req, res) => {
  try {
    const categories = await allDb(
      "SELECT category_id, category_name FROM expense_categories ORDER BY category_name",
    );
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: "Unable to load expense categories." });
  }
});

// Inventory Items - GET
app.get("/api/inventory-items", requireAuth, async (req, res) => {
  try {
    const items = await allDb(
      "SELECT item_id, item_name, stock_quantity, unit_price FROM inventory_items ORDER BY item_name",
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "Unable to load inventory items." });
  }
});

// Inventory Items - POST
app.post("/api/inventory-items", requireAuth, async (req, res) => {
  const { item_name, stock_quantity, unit_price } = req.body;
  if (!item_name || stock_quantity === undefined || !unit_price) {
    return res.status(400).json({
      error: "Item name, stock quantity, and unit price are required.",
    });
  }
  try {
    await runDb(
      "INSERT INTO inventory_items (item_name, stock_quantity, unit_price) VALUES (?, ?, ?)",
      [item_name, stock_quantity, unit_price],
    );
    res.json({ message: "Inventory item added successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to add inventory item." });
  }
});

// Inventory Items - PUT
app.put("/api/inventory-items/:id", requireAuth, async (req, res) => {
  const { item_name, stock_quantity, unit_price } = req.body;
  if (!item_name || stock_quantity === undefined || !unit_price) {
    return res.status(400).json({
      error: "Item name, stock quantity, and unit price are required.",
    });
  }
  try {
    await runDb(
      "UPDATE inventory_items SET item_name = ?, stock_quantity = ?, unit_price = ? WHERE item_id = ?",
      [item_name, stock_quantity, unit_price, req.params.id],
    );
    res.json({ message: "Inventory item updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update inventory item." });
  }
});

// Inventory Items - DELETE
app.delete("/api/inventory-items/:id", requireAuth, async (req, res) => {
  try {
    await runDb("DELETE FROM inventory_items WHERE item_id = ?", [
      req.params.id,
    ]);
    res.json({ message: "Inventory item deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete inventory item." });
  }
});

// Expenses - GET ALL
app.get("/api/expenses", requireAuth, async (req, res) => {
  try {
    const expenses = await allDb(
      `SELECT e.expense_id, e.category_id, c.category_name, e.expense_name, 
              e.description, e.amount, e.expense_date, e.payment_method, e.status, 
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories c ON e.category_id = c.category_id
       ORDER BY e.expense_date DESC`,
    );
    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ error: "Unable to load expenses." });
  }
});

// Daily expense summary
app.get("/api/expenses/summary/daily", requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const rows = await allDb(
      `SELECT c.category_name, SUM(e.amount) as total
       FROM expenses e
       LEFT JOIN expense_categories c ON e.category_id = c.category_id
       WHERE DATE(e.expense_date) = ?
       GROUP BY c.category_name`,
      [today],
    );
    const inventory =
      rows.find((r) => r.category_name === "Inventory Expense")?.total || 0;
    const operating =
      rows.find((r) => r.category_name === "Operating Expense")?.total || 0;
    res.json({
      inventory,
      operating,
      total: parseFloat(inventory) + parseFloat(operating),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load daily expense summary." });
  }
});

// Weekly expense summary (last 7 days)
app.get("/api/expenses/summary/weekly", requireAuth, async (req, res) => {
  try {
    const rows = await allDb(
      `SELECT c.category_name, SUM(e.amount) as total
       FROM expenses e
       LEFT JOIN expense_categories c ON e.category_id = c.category_id
       WHERE DATE(e.expense_date) >= DATE('now', '-7 days')
       GROUP BY c.category_name`,
    );
    const inventory =
      rows.find((r) => r.category_name === "Inventory Expense")?.total || 0;
    const operating =
      rows.find((r) => r.category_name === "Operating Expense")?.total || 0;
    res.json({
      inventory,
      operating,
      total: parseFloat(inventory) + parseFloat(operating),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load weekly expense summary." });
  }
});

// Monthly expense summary (current month)
app.get("/api/expenses/summary/monthly", requireAuth, async (req, res) => {
  try {
    const rows = await allDb(
      `SELECT c.category_name, SUM(e.amount) as total
       FROM expenses e
       LEFT JOIN expense_categories c ON e.category_id = c.category_id
       WHERE strftime('%Y-%m', e.expense_date) = strftime('%Y-%m', 'now')
       GROUP BY c.category_name`,
    );
    const inventory =
      rows.find((r) => r.category_name === "Inventory Expense")?.total || 0;
    const operating =
      rows.find((r) => r.category_name === "Operating Expense")?.total || 0;
    res.json({
      inventory,
      operating,
      total: parseFloat(inventory) + parseFloat(operating),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load monthly expense summary." });
  }
});

// Expense summary for a specific month (YYYY-MM)
app.get("/api/expenses/summary/by-month", requireAuth, async (req, res) => {
  const month = req.query.month;
  if (!month)
    return res.status(400).json({ error: "month param required (YYYY-MM)" });
  try {
    const rows = await allDb(
      `SELECT c.category_name, SUM(e.amount) as total
       FROM expenses e
       LEFT JOIN expense_categories c ON e.category_id = c.category_id
       WHERE strftime('%Y-%m', e.expense_date) = ?
       GROUP BY c.category_name`,
      [month],
    );
    const inventory = parseFloat(
      rows.find((r) => r.category_name === "Inventory Expense")?.total || 0,
    );
    const operating = parseFloat(
      rows.find((r) => r.category_name === "Operating Expense")?.total || 0,
    );
    res.json({ inventory, operating, total: inventory + operating, month });
  } catch (err) {
    res.status(500).json({ error: "Failed to load expense summary by month." });
  }
});

// Expenses - GET by ID
app.get("/api/expenses/:id", requireAuth, async (req, res) => {
  try {
    const expense = await getDb(
      `SELECT e.*, c.category_name FROM expenses e
       LEFT JOIN expense_categories c ON e.category_id = c.category_id
       WHERE e.expense_id = ?`,
      [req.params.id],
    );
    if (!expense) {
      return res.status(404).json({ error: "Expense not found." });
    }
    res.json({ expense });
  } catch (err) {
    res.status(500).json({ error: "Unable to load expense." });
  }
});

// Expenses - POST (CREATE)
app.post("/api/expenses", requireAuth, async (req, res) => {
  const {
    category_id,
    expense_name,
    description,
    amount,
    expense_date,
    payment_method,
    status,
  } = req.body;
  if (!category_id || !expense_name || !amount || !expense_date) {
    return res.status(400).json({
      error: "Category, expense name, amount, and date are required.",
    });
  }
  try {
    const now = new Date().toISOString();
    const result = await runDb(
      `INSERT INTO expenses (category_id, expense_name, description, amount, expense_date, payment_method, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        expense_name,
        description,
        amount,
        expense_date,
        payment_method,
        status || "pending",
        now,
        now,
      ],
    );
    res.json({
      message: "Expense created successfully.",
      expense_id: result.lastID,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create expense." });
  }
});

// Expenses - PUT (UPDATE)
app.put("/api/expenses/:id", requireAuth, async (req, res) => {
  const {
    category_id,
    expense_name,
    description,
    amount,
    expense_date,
    payment_method,
    status,
  } = req.body;
  if (!category_id || !expense_name || !amount || !expense_date) {
    return res.status(400).json({
      error: "Category, expense name, amount, and date are required.",
    });
  }
  try {
    const now = new Date().toISOString();
    await runDb(
      `UPDATE expenses SET category_id = ?, expense_name = ?, description = ?, amount = ?, 
              expense_date = ?, payment_method = ?, status = ?, updated_at = ? WHERE expense_id = ?`,
      [
        category_id,
        expense_name,
        description,
        amount,
        expense_date,
        payment_method,
        status,
        now,
        req.params.id,
      ],
    );
    res.json({ message: "Expense updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update expense." });
  }
});

// Expenses - DELETE
app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
  try {
    // Delete related details first
    await runDb("DELETE FROM inventory_expense_details WHERE expense_id = ?", [
      req.params.id,
    ]);
    await runDb("DELETE FROM operating_expense_details WHERE expense_id = ?", [
      req.params.id,
    ]);
    // Then delete the main expense
    await runDb("DELETE FROM expenses WHERE expense_id = ?", [req.params.id]);
    res.json({ message: "Expense deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete expense." });
  }
});

// Inventory Expense Details - POST
app.post("/api/inventory-expense-details", requireAuth, async (req, res) => {
  const { expense_id, item_id, quantity, unit_cost, subtotal } = req.body;
  if (!expense_id || !item_id || !quantity || !unit_cost || !subtotal) {
    return res.status(400).json({ error: "All fields are required." });
  }
  try {
    await runDb(
      `INSERT INTO inventory_expense_details (expense_id, item_id, quantity, unit_cost, subtotal)
       VALUES (?, ?, ?, ?, ?)`,
      [expense_id, item_id, quantity, unit_cost, subtotal],
    );
    res.json({ message: "Inventory expense detail added successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to add inventory expense detail." });
  }
});

// Inventory Expense Details - GET by expense ID
app.get(
  "/api/inventory-expense-details/:expenseId",
  requireAuth,
  async (req, res) => {
    try {
      const details = await allDb(
        `SELECT ied.*, ii.item_name FROM inventory_expense_details ied
       LEFT JOIN inventory_items ii ON ied.item_id = ii.item_id
       WHERE ied.expense_id = ?`,
        [req.params.expenseId],
      );
      res.json({ details });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Unable to load inventory expense details." });
    }
  },
);

// Operating Expense Details - POST
app.post("/api/operating-expense-details", requireAuth, async (req, res) => {
  const { expense_id, bill_type, billing_period, provider } = req.body;
  if (!expense_id) {
    return res.status(400).json({ error: "Expense ID is required." });
  }
  try {
    await runDb(
      `INSERT INTO operating_expense_details (expense_id, bill_type, billing_period, provider)
       VALUES (?, ?, ?, ?)`,
      [expense_id, bill_type, billing_period, provider],
    );
    res.json({ message: "Operating expense detail added successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to add operating expense detail." });
  }
});

// Operating Expense Details - GET by expense ID
app.get(
  "/api/operating-expense-details/:expenseId",
  requireAuth,
  async (req, res) => {
    try {
      const details = await getDb(
        `SELECT * FROM operating_expense_details WHERE expense_id = ?`,
        [req.params.expenseId],
      );
      res.json({ details: details || {} });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Unable to load operating expense details." });
    }
  },
);

// ── Analytics Routes ────────────────────────────────────────────
app.get("/api/analytics/daily-sales", requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const result = await getDb(
      `SELECT COALESCE(SUM(total), 0) as amount FROM receipts 
       WHERE DATE(created_at) = ?`,
      [today],
    );
    res.json({ daily: result?.amount || 0 });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch daily sales." });
  }
});

app.get("/api/analytics/weekly-sales", requireAuth, async (req, res) => {
  try {
    // Last 7 days
    const result = await getDb(
      `SELECT COALESCE(SUM(total), 0) as amount FROM receipts 
       WHERE DATE(created_at) >= DATE('now', '-7 days')`,
      [],
    );
    res.json({ weekly: result?.amount || 0 });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch weekly sales." });
  }
});

app.get("/api/analytics/monthly-sales", requireAuth, async (req, res) => {
  try {
    // Current month
    const result = await getDb(
      `SELECT COALESCE(SUM(total), 0) as amount FROM receipts 
       WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
      [],
    );
    res.json({ monthly: result?.amount || 0 });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch monthly sales." });
  }
});

app.get("/api/analytics/sales-chart", requireAuth, async (req, res) => {
  try {
    // Last 7 days daily sales
    const results = await allDb(
      `SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as total
       FROM receipts
       WHERE DATE(created_at) >= DATE('now', '-7 days')
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [],
    );
    res.json({ chartData: results || [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chart data." });
  }
});

app.get("/api/analytics/revenue-by-room", requireAuth, async (req, res) => {
  try {
    // Revenue breakdown by room type for current month
    const results = await allDb(
      `SELECT r.type, COALESCE(SUM(rec.total), 0) as revenue
       FROM receipts rec
       LEFT JOIN bookings b ON rec.booking_id = b.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE strftime('%Y-%m', rec.created_at) = strftime('%Y-%m', 'now')
       GROUP BY r.type
       ORDER BY revenue DESC`,
      [],
    );
    res.json({ roomRevenue: results || [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch room revenue data." });
  }
});

app.get("/api/analytics/financial-report", requireAuth, async (req, res) => {
  const { month, period } = req.query;
  if (!month) return res.status(400).json({ error: "month param required" });

  try {
    let dateFilter = "";
    let dateParams = [];

    if (period === "daily") {
      const today = new Date().toISOString().slice(0, 10);
      dateFilter = "DATE(created_at) = ?";
      dateParams = [today];
    } else if (period === "weekly") {
      dateFilter = "DATE(created_at) >= DATE('now', '-7 days')";
      dateParams = [];
    } else {
      // monthly (default)
      dateFilter = "strftime('%Y-%m', created_at) = ?";
      dateParams = [month];
    }

    // Revenue from receipts
    const revenueRow = await getDb(
      `SELECT 
         COALESCE(SUM(room_rate), 0) as room_revenue,
         COALESCE(SUM(food_amount), 0) as food_revenue,
         COALESCE(SUM(total), 0) as total_revenue
       FROM receipts WHERE ${dateFilter}`,
      dateParams,
    );

    // Expenses grouped by expense_name
    let expDateFilter = "";
    let expParams = [];
    if (period === "daily") {
      const today = new Date().toISOString().slice(0, 10);
      expDateFilter = "DATE(e.expense_date) = ?";
      expParams = [today];
    } else if (period === "weekly") {
      expDateFilter = "DATE(e.expense_date) >= DATE('now', '-7 days')";
      expParams = [];
    } else {
      expDateFilter = "strftime('%Y-%m', e.expense_date) = ?";
      expParams = [month];
    }

    const expenseRows = await allDb(
      `SELECT ec.category_name, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.category_id
      WHERE ${expDateFilter}
      GROUP BY ec.category_id, ec.category_name
      ORDER BY total DESC`,
      expParams,
    );

    const totalExpenses = expenseRows.reduce(
      (sum, r) => sum + parseFloat(r.total || 0),
      0,
    );
    const netIncome =
      parseFloat(revenueRow?.total_revenue || 0) - totalExpenses;

    // Sidebar: occupancy for today
    const totalRooms = await getDb(`SELECT COUNT(*) as count FROM rooms`);
    const occupiedRooms = await getDb(
      `SELECT COUNT(*) as count FROM bookings WHERE status = 'occupied' AND checked_out = 0`,
    );
    const occupancyPct = totalRooms?.count
      ? Math.round((occupiedRooms?.count / totalRooms?.count) * 100)
      : 0;

    // ADR (Average Daily Rate) = room revenue / occupied rooms
    const adr = occupiedRooms?.count
      ? parseFloat(revenueRow?.room_revenue || 0) / occupiedRooms.count
      : 0;

    // Weekly trend (last 7 days daily totals)
    const weeklyTrend = await allDb(
      `SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as total
       FROM receipts
       WHERE DATE(created_at) >= DATE('now', '-6 days')
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
    );

    res.json({
      revenue: {
        room: parseFloat(revenueRow?.room_revenue || 0),
        food: parseFloat(revenueRow?.food_revenue || 0),
        total: parseFloat(revenueRow?.total_revenue || 0),
      },
      expenses: expenseRows.map((r) => ({
        name: r.category_name,
        total: parseFloat(r.total || 0),
      })),
      totalExpenses,
      netIncome,
      sidebar: {
        occupancyPct,
        adr: parseFloat(adr.toFixed(2)),
        dailyNet: parseFloat(netIncome.toFixed(2)),
        weeklyTrend,
      },
    });
  } catch (err) {
    console.error("Financial report error:", err);
    res.status(500).json({ error: "Failed to load financial report." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

seedDatabase();

app.listen(PORT, () => {
  console.log(`Hotel management system running at http://localhost:${PORT}`);
});
