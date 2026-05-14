const API_BASE = "/api";
const views = {
  login: document.getElementById("login-view"),
  app: document.getElementById("app-view"),
};
const panels = {
  dashboard: document.getElementById("dashboard-view"),
  rooms: document.getElementById("rooms-view"),
  billing: document.getElementById("billing-view"),
  orders: document.getElementById("orders-view"),
  receipts: document.getElementById("receipts-view"),
  ledger: document.getElementById("ledger-view"),
  housekeeping: document.getElementById("housekeeping-view"),
  booking: document.getElementById("booking-view"),
  occupiedRooms: document.getElementById("occupied-rooms-view"),
  expenses: document.getElementById("expenses-view"),
  sales: document.getElementById("sales-view"),
};
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const navLinks = document.getElementById("nav-links");
const roleLabel = document.getElementById("role-label");
const logoutButton = document.getElementById("logout-button");

let session = { token: null, user: null };

function saveSession(token, user) {
  console.log(
    "💾 Saving session - Token:",
    token ? token.substring(0, 20) + "..." : "NO TOKEN",
  );
  console.log("💾 Saving session - User:", user);

  session.token = token;
  session.user = user;

  // Also save to localStorage for persistence
  localStorage.setItem(
    "hotel_session",
    JSON.stringify({
      token: token,
      user: user,
      savedAt: Date.now(),
    }),
  );

  // Verify it was saved
  console.log(
    "✅ Session saved. Current session.token:",
    session.token ? "EXISTS" : "MISSING",
  );
}

function loadSession() {
  try {
    const saved = localStorage.getItem("hotel_session");
    if (saved) {
      const data = JSON.parse(saved);
      session.token = data.token;
      session.user = data.user;
      console.log(
        "✅ Session loaded:",
        session.token ? "Token exists" : "No token",
      );
    }
  } catch (e) {
    console.error("Failed to load session:", e);
  }
}

function clearSession() {
  session.token = null;
  session.user = null;
  localStorage.removeItem("hotel_session");
  console.log("Session cleared");
}

loadSession();

async function api(path, options = {}) {
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json";

  // Add session token if available
  if (session.token) {
    headers["x-session-token"] = session.token;
    console.log(`📡 API Call: ${path} - Token sent`);
  } else {
    console.warn(`⚠️ No token for API call: ${path}`);
  }

  try {
    const response = await fetch(API_BASE + path, { ...options, headers });

    // Check if response is HTML (authentication redirect)
    const contentType = response.headers.get("content-type");
    const text = await response.text();

    // Check for HTML response
    if (
      text.trim().startsWith("<!DOCTYPE") ||
      text.trim().startsWith("<html") ||
      text.includes("<!doctype html>")
    ) {
      console.error("❌ Received HTML instead of JSON - Authentication failed");

      // Clear invalid session
      session.token = null;
      session.user = null;
      localStorage.removeItem("hotel_session");

      // Redirect to login
      if (typeof showLoginView === "function") {
        showLoginView();
      }

      throw new Error("Authentication failed. Please login again.");
    }

    // Try to parse JSON
    try {
      const data = JSON.parse(text);

      if (!response.ok) {
        const err = new Error(data.error || "Request failed");
        err.status = response.status;
        throw err;
      }

      return data;
    } catch (jsonError) {
      console.error("❌ Failed to parse JSON:", text.substring(0, 200));
      throw new Error("Server returned invalid response format");
    }
  } catch (err) {
    console.error(`❌ API Error for ${path}:`, err);
    throw err;
  }
}

function showView(name) {
  const isLogin = name === "login";

  // Trigger transitions by toggling a helper class
  // (so the browser animates opacity/transform instead of instant switching)
  if (views.login && views.app) {
    views.login.classList.toggle("is-switching", isLogin);
    views.app.classList.toggle("is-switching", !isLogin);
  }

  views.login.classList.toggle("active", isLogin);
  views.app.classList.toggle("active", !isLogin);

  // Cleanup helper class after transition ends
  setTimeout(() => {
    if (views.login) views.login.classList.remove("is-switching");
    if (views.app) views.app.classList.remove("is-switching");
  }, 450);
}

function showPanel(panelName) {
  Object.values(panels).forEach((panel) => panel.classList.add("hidden"));
  panels[panelName].classList.remove("hidden");
}

function setNav(items) {
  navLinks.innerHTML = "";
  items.forEach(({ title, panel }) => {
    const button = document.createElement("button");
    button.textContent = title;
    button.addEventListener("click", () => {
      showPanel(panel);
      renderPanel(panel);
    });
    navLinks.appendChild(button);
  });
}

async function renderAdminDashboard() {
  panels.dashboard.innerHTML = "";

  try {
    const [menuData, ratesData] = await Promise.all([
      api("/menu"),
      api("/room-rates"),
    ]);

    // ==================== TOP SECTION ====================
    const topSection = document.createElement("div");
    topSection.className = "dashboard-grid";

    // ROOM RATES CARD
    const ratesCard = document.createElement("div");
    ratesCard.className = "card-column";
    ratesCard.innerHTML = "<h2>ROOM RATES</h2>";

    ratesData.rates.forEach((room) => {
      const item = document.createElement("div");
      item.className = "room-item";
      item.innerHTML = `
        <div>
          <strong>Room ${room.number}</strong>
          <div class="room-rate">₱${room.rate}</div>
        </div>
      `;
      ratesCard.appendChild(item);
    });

    topSection.appendChild(ratesCard);

    // MENU CARD
    const menuCard = document.createElement("div");
    menuCard.className = "card-column";
    menuCard.innerHTML = "<h2>MENU</h2>";

    menuData.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "room-item";
      row.innerHTML = `
        <div>
          <strong>${item.name}</strong>
          <div class="room-rate">₱${item.price}</div>
        </div>
      `;
      menuCard.appendChild(row);
    });

    topSection.appendChild(menuCard);
    panels.dashboard.appendChild(topSection);
  } catch (err) {
    panels.dashboard.innerHTML = `
      <p class="error">Error loading dashboard: ${err.message}</p>
    `;
  }
}

async function renderFoodBeverageDashboard() {
  panels.dashboard.innerHTML = "";

  // 🔥 ADD THIS (Menu Section)
  const menuContainer = document.createElement("div");
  panels.dashboard.appendChild(menuContainer);

  // render menu CRUD
  await renderMenuManager(menuContainer);

  // separator
  const hr = document.createElement("hr");
  hr.style.margin = "20px 0";
  panels.dashboard.appendChild(hr);
  try {
    const response = await api("/orders");

    const heading = document.createElement("h2");
    heading.textContent = "PENDING ORDERS";
    panels.dashboard.appendChild(heading);

    if (response.orders.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No pending orders.";
      panels.dashboard.appendChild(empty);
      return;
    }

    const ordersGrid = document.createElement("div");
    ordersGrid.className = "food-orders-grid";

    response.orders.forEach((order) => {
      const card = document.createElement("div");
      card.className = "order-card";

      // ── Check if order is still pending ────────────────────────
      const isPending = order.status !== "delivered";

      card.innerHTML = `
        <div class="order-header">
          <strong>Room ${order.room_number}</strong>
          <span class="status ${order.status === "delivered" ? "delivered" : "pending"}">
            ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </span>
        </div>
        <div class="order-details">
          <span><strong>Order:</strong> ${order.food_order}</span>
          <span><strong>Guest:</strong> ${order.guest_name || "N/A"}</span>
          <span><strong>Serve by:</strong> ${order.serve_time || "N/A"}</span>
        </div>

        <!-- Show deliver button only if order is still pending -->
        ${
          isPending
            ? `
          <div class="order-actions" style="margin-top: 10px;">
            <button 
              class="deliver-btn"
              data-order-id="${order.id}"
              data-room="${order.room_number}"
              style="
                width: 100%;
                padding: 8px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                font-weight: bold;
              ">
              ✅ Mark as Delivered
            </button>
            <small class="deliver-error" style="
              color: red;
              display: none;
              margin-top: 4px;
              display: none;
            "></small>
          </div>
        `
            : `
          <div style="margin-top: 10px; text-align: center;">
            <small style="color: #2e7d32;">✔️ Order Already Delivered</small>
          </div>
        `
        }
      `;

      // ── Attach deliver button click event ───────────────────────
      if (isPending) {
        const deliverBtn = card.querySelector(".deliver-btn");
        const errorMsg = card.querySelector(".deliver-error");

        deliverBtn.addEventListener("click", async () => {
          const orderId = deliverBtn.dataset.orderId;
          const roomNum = deliverBtn.dataset.room;

          // Confirm before marking as delivered
          const confirmed = confirm(`Confirm delivery for Room ${roomNum}?`);
          if (!confirmed) return;

          // Disable button to prevent double clicks
          deliverBtn.disabled = true;
          deliverBtn.textContent = "Delivering...";
          errorMsg.style.display = "none";

          try {
            // Call API to update order status to delivered
            await api(`/orders/deliver`, {
              method: "POST",
              body: JSON.stringify({ orderId }),
            });

            console.log(`✅ Order for Room ${roomNum} marked as delivered.`);

            // ── Success: update card UI immediately ───────────────
            // Update status badge
            const statusBadge = card.querySelector(".status");
            statusBadge.textContent = "Delivered";
            statusBadge.classList.remove("pending");
            statusBadge.classList.add("delivered");

            // Replace deliver button with delivered message
            const orderActions = card.querySelector(".order-actions");
            orderActions.innerHTML = `
              <small style="color: #2e7d32; font-weight: bold;">
                ✔️ Order Delivered Successfully
              </small>
            `;

            // Refresh dashboard after short delay
            setTimeout(() => renderFoodBeverageDashboard(), 1500);
          } catch (err) {
            console.error(
              `❌ Failed to deliver order for Room ${roomNum}:`,
              err,
            );

            // Re-enable button so staff can retry
            deliverBtn.disabled = false;
            deliverBtn.textContent = "✅ Mark as Delivered";

            // Show specific error message based on status code
            const status = err.status || err.statusCode;
            errorMsg.style.display = "block";

            if (status === 404) {
              errorMsg.textContent =
                "❌ Order not found. Please refresh the page.";
            } else if (status === 403) {
              errorMsg.textContent =
                "❌ You are not authorized to update this order.";
            } else if (status === 409) {
              errorMsg.textContent = "❌ Order has already been delivered.";
            } else if (status === 500) {
              errorMsg.textContent = "❌ Server error. Please try again later.";
            } else {
              errorMsg.textContent =
                "❌ Failed: " + (err.message || "Unknown error. Try again.");
            }
          }
        });
      }

      ordersGrid.appendChild(card);
    });

    panels.dashboard.appendChild(ordersGrid);
  } catch (err) {
    console.error("renderFoodBeverageDashboard: Failed to load orders →", err);
    panels.dashboard.innerHTML = `
      <p class="error">❌ Error loading orders: ${err.message}</p>
      <button onclick="renderFoodBeverageDashboard()" style="
        margin-top: 10px; padding: 8px 16px;
        background: #2196F3; color: white;
        border: none; border-radius: 4px; cursor: pointer;
      ">🔄 Retry</button>
    `;
  }
}

async function renderMenuManager(container) {
  container.innerHTML = `
    <h2>🍽️ Menu Management</h2>

    <input id="search-menu" placeholder="Search food..." 
      style="margin-bottom:10px; padding:5px; width:100%;" />

    <div id="menu-list" style="margin-bottom:15px;"></div>

    <h3>Add New Item</h3>
    <input id="new-name" placeholder="Food name" />
    <input id="new-price" type="number" placeholder="Price" />
    <button id="add-menu">Add</button>
    <hr style="margin:20px 0;">
  `;

  const menuList = container.querySelector("#menu-list");

  async function loadMenu() {
    const data = await api("/menu");
    menuList.innerHTML = "";

    data.items.forEach((item) => {
      const div = document.createElement("div");

      div.innerHTML = `
        ${item.name} - ₱${item.price}
        <button class="edit">✏️</button>
        <button class="delete">🗑️</button>
      `;

      // DELETE
      div.querySelector(".delete").onclick = async () => {
        if (!confirm("Delete this item?")) return;
        await api(`/menu/${item.id}`, { method: "DELETE" });
        loadMenu();
      };

      // EDIT
      div.querySelector(".edit").onclick = async () => {
        const newName = prompt("New name:", item.name);
        const newPrice = prompt("New price:", item.price);

        if (!newName || !newPrice) return;

        await api(`/menu/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: newName, price: newPrice }),
        });

        loadMenu();
      };

      menuList.appendChild(div);
    });
  }

  // ADD
  container.querySelector("#add-menu").onclick = async () => {
    const name = container.querySelector("#new-name").value;
    const price = container.querySelector("#new-price").value;

    if (!name || !price) return alert("Fill all fields");

    await api("/menu", {
      method: "POST",
      body: JSON.stringify({ name, price }),
    });

    loadMenu();
  };

  // SEARCH
  container
    .querySelector("#search-menu")
    .addEventListener("input", async (e) => {
      const keyword = e.target.value.toLowerCase();
      const data = await api("/menu");

      menuList.innerHTML = "";

      data.items
        .filter((item) => item.name.toLowerCase().includes(keyword))
        .forEach((item) => {
          const div = document.createElement("div");
          div.textContent = `${item.name} - ₱${item.price}`;
          menuList.appendChild(div);
        });
    });

  loadMenu();
}

async function renderAccountingDashboard() {
  panels.dashboard.innerHTML = "";

  // ── SESSION VALIDATION ─────────────────────────────────────────────
  if (!session.token) {
    console.error("❌ No session token found");
    panels.dashboard.innerHTML = `
      <div style="text-align: center; padding: 40px; background: white; border-radius: 8px;">
        <h3 style="color: #dc3545;">Authentication Required</h3>
        <p style="margin: 20px 0;">Please login to access the accounting dashboard.</p>
        <button onclick="logout()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Go to Login</button>
      </div>
    `;
    return;
  }

  console.log("🟢 Loading accounting dashboard...");
  panels.dashboard.innerHTML =
    '<div style="text-align: center; padding: 40px;">Loading dashboard...</div>';

  try {
    // ── FETCH ALL DATA WITH INDIVIDUAL ERROR HANDLING ─────────────────
    console.log("📡 Fetching analytics data...");

    const results = await Promise.allSettled([
      api("/analytics/daily-sales"),
      api("/analytics/weekly-sales"),
      api("/analytics/monthly-sales"),
      api("/analytics/sales-chart"),
      api("/analytics/revenue-by-room"),
      api("/receipts"),
    ]);

    // Check if any request failed due to authentication
    const authError = results.find(
      (r) =>
        r.status === "rejected" &&
        r.reason?.message?.includes("Authentication"),
    );

    if (authError) {
      console.error("🔒 Authentication error detected");
      panels.dashboard.innerHTML = `
        <div style="text-align: center; padding: 40px; background: white; border-radius: 8px;">
          <h3 style="color: #dc3545;">Session Expired</h3>
          <p style="margin: 20px 0;">Your session has expired. Please login again.</p>
          <button onclick="logout()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Login Again</button>
        </div>
      `;
      return;
    }

    // Extract data from successful promises, use defaults for failures
    const dailyData =
      results[0]?.status === "fulfilled" ? results[0].value : { daily: 0 };
    const weeklyData =
      results[1]?.status === "fulfilled" ? results[1].value : { weekly: 0 };
    const monthlyData =
      results[2]?.status === "fulfilled" ? results[2].value : { monthly: 0 };
    const chartData =
      results[3]?.status === "fulfilled" ? results[3].value : { chartData: [] };
    const roomRevenueData =
      results[4]?.status === "fulfilled"
        ? results[4].value
        : { roomRevenue: [] };
    const receiptsData =
      results[5]?.status === "fulfilled" ? results[5].value : { receipts: [] };

    console.log("✅ Data fetched successfully");

    // ✅ STORE GLOBAL DATA FOR PRINTING
    window.accountingData = {
      daily: dailyData.daily,
      weekly: weeklyData.weekly,
      monthly: monthlyData.monthly,
      chartData: chartData.chartData,
      roomRevenue: roomRevenueData.roomRevenue,
      receipts: receiptsData.receipts,
    };

    // Clear loading message
    panels.dashboard.innerHTML = "";

    // ── DASHBOARD TITLE ────────────────────────────────────────────
    const dashboardTitle = document.createElement("h2");
    dashboardTitle.textContent = "📊 Accounting Analytics Dashboard";
    dashboardTitle.style.cssText = `margin: 0 0 25px 0; color: #2c3e50; font-size: 24px; font-weight: 600;`;
    // ================= DASHBOARD HEADER =================
    const header = document.createElement("div");

    header.style.cssText = `
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
`;

    // TITLE (LEFT SIDE)

    dashboardTitle.style.cssText = `
  margin: 0;
  color: #2c3e50;
  font-size: 24px;
  font-weight: 600;
`;

    // PRINT BUTTON (RIGHT SIDE)
    const printBtn = document.createElement("button");
    printBtn.textContent = "🖨 Print Report";

    printBtn.style.cssText = `
  padding: 10px 18px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
`;

    // PRINT ACTION
    // printBtn.onclick = () => printAccountingDashboard();

    // const monthPicker = document.createElement("input");
    // monthPicker.type = "month";
    // monthPicker.id = "dashboard-month-picker";
    // // Default to current month
    // const now = new Date();
    // monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // monthPicker.style.cssText = `
    // padding: 8px 12px;
    // border: 1px solid #dee2e6;
    // border-radius: 6px;
    // font-size: 14px;
    // cursor: pointer;
    // color: #2c3e50;
    // font-weight: 500;
    // `;

    // ADD TITLE + BUTTON INTO HEADER
    // header.appendChild(dashboardTitle);
    // header.appendChild(printBtn);

    const headerControls = document.createElement("div");
    headerControls.style.cssText = `display: flex; gap: 10px; align-items: center;`;
    // headerControls.appendChild(monthPicker);
    // headerControls.appendChild(printBtn);

    header.appendChild(dashboardTitle);
    header.appendChild(headerControls);
    panels.dashboard.appendChild(header);

    // ADD HEADER TO DASHBOARD
    panels.dashboard.appendChild(header);

    // ── 1. ANALYTICS SUMMARY CARDS ─────────────────────────────────

    const analyticsSection = document.createElement("div");
    analyticsSection.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 25px;
    `;

    // Daily Sales Card
    const dailyCard = document.createElement("div");
    dailyCard.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 18px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    `;
    dailyCard.onmouseover = () =>
      (dailyCard.style.transform = "translateY(-2px)");
    dailyCard.onmouseout = () => (dailyCard.style.transform = "none");
    dailyCard.innerHTML = `
      <p style="margin: 0 0 8px 0; font-size: 12px; opacity: 0.9; font-weight: 500;">📅 Daily Sales</p>
      <h3 style="margin: 0; font-size: 24px; font-weight: bold;">₱${parseFloat(dailyData.daily || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</h3>
      <p style="margin: 5px 0 0 0; font-size: 11px; opacity: 0.8;">Today</p>
    `;
    analyticsSection.appendChild(dailyCard);

    // Weekly Sales Card
    const weeklyCard = document.createElement("div");
    weeklyCard.style.cssText = `
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
      padding: 18px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    `;
    weeklyCard.onmouseover = () =>
      (weeklyCard.style.transform = "translateY(-2px)");
    weeklyCard.onmouseout = () => (weeklyCard.style.transform = "none");
    weeklyCard.innerHTML = `
      <p style="margin: 0 0 8px 0; font-size: 12px; opacity: 0.9; font-weight: 500;">📊 Weekly Sales</p>
      <h3 style="margin: 0; font-size: 24px; font-weight: bold;">₱${parseFloat(weeklyData.weekly || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</h3>
      <p style="margin: 5px 0 0 0; font-size: 11px; opacity: 0.8;">Last 7 days</p>
    `;
    analyticsSection.appendChild(weeklyCard);

    // Monthly Sales Card
    const monthlyCard = document.createElement("div");
    monthlyCard.style.cssText = `
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      color: white;
      padding: 18px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    `;
    monthlyCard.onmouseover = () =>
      (monthlyCard.style.transform = "translateY(-2px)");
    monthlyCard.onmouseout = () => (monthlyCard.style.transform = "none");
    monthlyCard.innerHTML = `
      <p style="margin: 0 0 8px 0; font-size: 12px; opacity: 0.9; font-weight: 500;">📈 Monthly Sales</p>
      <h3 style="margin: 0; font-size: 24px; font-weight: bold;">₱${parseFloat(monthlyData.monthly || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</h3>
      <p style="margin: 5px 0 0 0; font-size: 11px; opacity: 0.8;">This month</p>
    `;
    analyticsSection.appendChild(monthlyCard);

    // Net Income Card — will be updated after expense data loads
    const netIncomeCard = document.createElement("div");
    netIncomeCard.id = "net-income-card";
    netIncomeCard.style.cssText = `
    background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    color: white;
    padding: 18px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;
    netIncomeCard.innerHTML = `
    <p style="margin:0 0 8px 0; font-size:12px; opacity:0.9; font-weight:500;">💰 Net Income</p>
    <h3 style="margin:0; font-size:24px; font-weight:bold;">Loading...</h3>
    <p style="margin:5px 0 0 0; font-size:11px; opacity:0.8;">This month</p>
  `;
    analyticsSection.appendChild(netIncomeCard);

    panels.dashboard.appendChild(analyticsSection);

    // ── 2. MAIN CONTENT GRID (CHART + RECEIPTS) ────────────────────
    const mainGrid = document.createElement("div");
    mainGrid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    `;

    // ── 2A. SALES CHART (LEFT COLUMN) ─────────────────────────────
    if (chartData.chartData && chartData.chartData.length > 0) {
      const chartSection = document.createElement("div");
      chartSection.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        height: 370px;
        display: flex;
        flex-direction: column;
      `;
      chartSection.innerHTML = `<h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600; flex-shrink: 0;">📈 Sales Trend (Last 7 Days)</h3>`;

      const chartContainer = document.createElement("div");
      chartContainer.style.cssText = `
        flex: 1;
        position: relative;
        min-height: 0;
      `;

      const chartCanvas = document.createElement("canvas");
      chartCanvas.id = "salesChart";
      chartCanvas.style.cssText = `max-width: 100%; height: 100%;`;
      chartContainer.appendChild(chartCanvas);
      chartSection.appendChild(chartContainer);
      mainGrid.appendChild(chartSection);

      const chartLabels = chartData.chartData.map((item) => {
        const date = new Date(item.date);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      });
      const chartValues = chartData.chartData.map(
        (item) => parseFloat(item.total) || 0,
      );

      const ctx = chartCanvas.getContext("2d");
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: chartLabels,
          datasets: [
            {
              label: "Daily Sales (₱)",
              data: chartValues,
              backgroundColor: "rgba(102, 126, 234, 0.8)",
              borderColor: "rgba(102, 126, 234, 1)",
              borderWidth: 1.5,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 0,
          },
          plugins: {
            legend: {
              labels: {
                font: { size: 11 },
              },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return "₱" + context.parsed.y.toLocaleString();
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                font: { size: 11 },
                callback: function (value) {
                  return "₱" + (value / 1000).toFixed(0) + "k";
                },
              },
            },
          },
        },
      });
    } else {
      const noChartMsg = document.createElement("div");
      noChartMsg.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
        text-align: center;
        color: #7f8c8d;
      `;
      noChartMsg.textContent = "No sales data available for the last 7 days.";
      mainGrid.appendChild(noChartMsg);
    }

    // ── 2B. REVENUE BREAKDOWN BY ROOM TYPE (RIGHT COLUMN) ──────────────
    if (roomRevenueData.roomRevenue && roomRevenueData.roomRevenue.length > 0) {
      const roomRevenueSection = document.createElement("div");
      roomRevenueSection.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        height: 370px;
        display: flex;
        flex-direction: column;
      `;
      roomRevenueSection.innerHTML = `<h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600; flex-shrink: 0;">🏠 Revenue Breakdown by Room Type</h3>`;

      const roomChartContainer = document.createElement("div");
      roomChartContainer.style.cssText = `
        flex: 1;
        position: relative;
        min-height: 0;
      `;

      const roomChartCanvas = document.createElement("canvas");
      roomChartCanvas.id = "roomRevenueChart";
      roomChartCanvas.style.cssText = `max-width: 100%; height: 100%;`;
      roomChartContainer.appendChild(roomChartCanvas);
      roomRevenueSection.appendChild(roomChartContainer);
      mainGrid.appendChild(roomRevenueSection);

      const roomLabels = roomRevenueData.roomRevenue.map(
        (item) => item.type || "Unknown",
      );
      const roomValues = roomRevenueData.roomRevenue.map(
        (item) => parseFloat(item.revenue) || 0,
      );

      const roomColors = [
        "rgba(102, 126, 234, 0.8)",
        "rgba(240, 147, 251, 0.8)",
        "rgba(79, 172, 254, 0.8)",
        "rgba(245, 87, 108, 0.8)",
        "rgba(34, 193, 195, 0.8)",
        "rgba(253, 187, 45, 0.8)",
        "rgba(150, 201, 61, 0.8)",
      ];

      const roomCtx = roomChartCanvas.getContext("2d");
      new Chart(roomCtx, {
        type: "doughnut",
        data: {
          labels: roomLabels,
          datasets: [
            {
              label: "Revenue (₱)",
              data: roomValues,
              backgroundColor: roomColors.slice(0, roomValues.length),
              borderColor: "#ffffff",
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 0,
          },
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                font: { size: 11 },
                padding: 10,
              },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return "₱" + context.parsed.toLocaleString();
                },
              },
            },
          },
        },
      });
    } else {
      const noRoomChart = document.createElement("div");
      noRoomChart.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
        text-align: center;
        color: #7f8c8d;
      `;
      noRoomChart.textContent =
        "No room revenue data available for this month.";
      mainGrid.appendChild(noRoomChart);
    }

    // ── 3. RECENT RECEIPTS TABLE (FULL WIDTH) ─────────────────────
    // ── 3. RECENT RECEIPTS TABLE (FULL WIDTH - PAGINATED) ────────────
    const receiptSection = document.createElement("div");
    receiptSection.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e0e0e0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      margin-top: 20px;
    `;
    receiptSection.innerHTML = `<h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600;">📋 Recent Receipts</h3>`;

    if (!receiptsData.receipts || receiptsData.receipts.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No receipts generated yet.";
      empty.style.cssText =
        "padding: 20px; text-align: center; color: #7f8c8d; margin: 0;";
      receiptSection.appendChild(empty);
      panels.dashboard.appendChild(receiptSection);
    } else {
      // ── Pagination setup for receipts ──────────────────────────────
      const receiptRowsPerPage = 10;
      let receiptCurrentPage = 1;
      const receiptTotalPages = Math.ceil(
        receiptsData.receipts.length / receiptRowsPerPage,
      );

      function renderReceiptTable(page) {
        const tableContainer = receiptSection.querySelector(
          "#receipts-table-container",
        );
        if (tableContainer) tableContainer.remove();

        const receiptTable = document.createElement("table");
        receiptTable.id = "receipts-table-container";
        receiptTable.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    `;

        // Calculate pagination
        const startIndex = (page - 1) * receiptRowsPerPage;
        const endIndex = Math.min(
          startIndex + receiptRowsPerPage,
          receiptsData.receipts.length,
        );
        const pageReceipts = receiptsData.receipts.slice(startIndex, endIndex);

        receiptTable.innerHTML = `
      <thead>
        <tr style="background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #2c3e50;">Receipt #</th>
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #2c3e50;">Room</th>
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #2c3e50;">Guest</th>
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #2c3e50;">Room Charge</th>
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #2c3e50;">Food</th>
          <th style="padding: 8px; text-align: right; font-weight: 600; color: #2c3e50;">Total</th>
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #2c3e50;">Date</th>
        </tr>
      </thead>
      <tbody>
        ${pageReceipts
          .map(
            (receipt) => `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 8px;"><strong style="color: #2980b9;">${receipt.receipt_number || "—"}</strong></td>
            <td style="padding: 8px;">${receipt.room_number || "—"}</td>
            <td style="padding: 8px;">${receipt.guest_name || "—"}</td>
            <td style="padding: 8px;">₱${parseFloat(receipt.room_rate || 0).toFixed(2)}</td>
            <td style="padding: 8px;">₱${parseFloat(receipt.food_amount || 0).toFixed(2)}</td>
            <td style="padding: 8px; text-align: right;"><strong style="color: #27ae60;">₱${parseFloat(receipt.total || 0).toFixed(2)}</strong></td>
            <td style="padding: 8px; font-size: 12px; color: #7f8c8d;">${new Date(receipt.created_at).toLocaleDateString()}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    `;

        const paginationContainer = receiptSection.querySelector(
          "#receipt-pagination",
        );
        if (paginationContainer) {
          receiptSection.insertBefore(receiptTable, paginationContainer);
        } else {
          receiptSection.appendChild(receiptTable);
        }

        // Update pagination info
        const pageInfo = receiptSection.querySelector("#receipt-page-info");
        if (pageInfo) {
          pageInfo.textContent = `Page ${page} of ${receiptTotalPages} (${startIndex + 1}-${endIndex} of ${receiptsData.receipts.length})`;
        }

        // Update button states
        const prevBtn = receiptSection.querySelector("#receipt-prev-btn");
        const nextBtn = receiptSection.querySelector("#receipt-next-btn");
        if (prevBtn) prevBtn.disabled = page === 1;
        if (nextBtn) nextBtn.disabled = page === receiptTotalPages;

        receiptCurrentPage = page;
      }

      // ── Pagination controls ────────────────────────────────────────
      const paginationDiv = document.createElement("div");
      paginationDiv.id = "receipt-pagination";
      paginationDiv.style.cssText = `
    margin-top: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #dee2e6;
  `;

      paginationDiv.innerHTML = `
    <button id="receipt-prev-btn" style="
      padding: 6px 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    ">← Previous</button>

    <span id="receipt-page-info" style="
      font-weight: 500;
      color: #495057;
      min-width: 250px;
      text-align: center;
      font-size: 13px;
    ">Page 1 of ${receiptTotalPages}</span>

    <button id="receipt-next-btn" style="
      padding: 6px 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    ">Next →</button>
  `;

      receiptSection.appendChild(paginationDiv);

      // ── Render first page ──────────────────────────────────────────
      renderReceiptTable(1);

      // ── Event listeners ────────────────────────────────────────────
      const prevBtn = receiptSection.querySelector("#receipt-prev-btn");
      const nextBtn = receiptSection.querySelector("#receipt-next-btn");

      prevBtn.addEventListener("click", () => {
        if (receiptCurrentPage > 1) {
          renderReceiptTable(receiptCurrentPage - 1);
          receiptSection.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      });

      nextBtn.addEventListener("click", () => {
        if (receiptCurrentPage < receiptTotalPages) {
          renderReceiptTable(receiptCurrentPage + 1);
          receiptSection.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      });

      // ── Keyboard navigation ────────────────────────────────────────
      document.addEventListener("keydown", (e) => {
        if (
          e.key === "ArrowLeft" &&
          receiptCurrentPage > 1 &&
          receiptSection.parentElement
        ) {
          renderReceiptTable(receiptCurrentPage - 1);
        } else if (
          e.key === "ArrowRight" &&
          receiptCurrentPage < receiptTotalPages &&
          receiptSection.parentElement
        ) {
          renderReceiptTable(receiptCurrentPage + 1);
        }
      });
    }

    panels.dashboard.appendChild(mainGrid);

    // ================= EXPENSE BAR GRAPH =================
    // ================= EXPENSE BREAKDOWN SECTION =================
    const expenseSection = document.createElement("div");
    expenseSection.style.cssText = `
  background: white;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-top: 20px;
  height: 440px;
  display: flex;
  flex-direction: column;
`;

    // Header row with title + toggle buttons
    const expenseHeader = document.createElement("div");
    expenseHeader.style.cssText = `
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-shrink: 0;
`;
    expenseHeader.innerHTML = `
  <h3 style="margin:0; color:#2c3e50;">💸 Expense Breakdown</h3>
  <div id="expense-period-btns" style="display:flex; gap:8px;">
    <button data-period="daily"   style="padding:6px 14px; border-radius:4px; border:1px solid #007bff; background:#007bff; color:white; cursor:pointer; font-size:13px; font-weight:600;">Daily</button>
    <button data-period="weekly"  style="padding:6px 14px; border-radius:4px; border:1px solid #dee2e6; background:white; color:#495057; cursor:pointer; font-size:13px;">Weekly</button>
    <button data-period="monthly" style="padding:6px 14px; border-radius:4px; border:1px solid #dee2e6; background:white; color:#495057; cursor:pointer; font-size:13px;">Monthly</button>
  </div>
`;
    expenseSection.appendChild(expenseHeader);

    // Summary text row (shows ₱ totals per category)
    const expenseSummaryRow = document.createElement("div");
    expenseSummaryRow.id = "expense-summary-row";
    expenseSummaryRow.style.cssText = `
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  flex-shrink: 0;
  font-size: 13px;
  color: #495057;
`;
    expenseSection.appendChild(expenseSummaryRow);

    // Canvas container
    const expCanvasWrap = document.createElement("div");
    expCanvasWrap.style.cssText = `flex:1; position:relative; min-height:0;`;
    const expenseCanvas = document.createElement("canvas");
    expenseCanvas.id = "expenseChart";
    expenseCanvas.style.cssText = `max-width:100%; height:100%;`;
    expCanvasWrap.appendChild(expenseCanvas);
    expenseSection.appendChild(expCanvasWrap);

    panels.dashboard.appendChild(expenseSection);

    // ── Chart instance + update logic ─────────────────────────────
    const expCtx = expenseCanvas.getContext("2d");
    let expenseChartInstance = null;

    async function updateExpenseChart(period) {
      // Toggle button styles
      document
        .querySelectorAll("#expense-period-btns button")
        .forEach((btn) => {
          const active = btn.dataset.period === period;
          btn.style.background = active ? "#007bff" : "white";
          btn.style.color = active ? "white" : "#495057";
          btn.style.borderColor = active ? "#007bff" : "#dee2e6";
          btn.style.fontWeight = active ? "600" : "400";
        });

      try {
        const data = await api(`/expenses/summary/${period}`);
        const inventory = parseFloat(data.inventory || 0);
        const operating = parseFloat(data.operating || 0);
        const total = parseFloat(data.total || 0);

        // Update summary text
        document.getElementById("expense-summary-row").innerHTML = `
      <span>📦 <strong>Inventory:</strong> ₱${inventory.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      <span style="color:#dee2e6;">|</span>
      <span>🏢 <strong>Operating:</strong> ₱${operating.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      <span style="color:#dee2e6;">|</span>
      <span>📊 <strong>Total:</strong> ₱${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
    `;

        // Update Net Income card using monthly revenue and this period's total
        // Only update net income when viewing monthly (apples-to-apples with monthly sales)
        if (period === "monthly") {
          const netIncome = parseFloat(monthlyData.monthly || 0) - total;
          const netCard = document.getElementById("net-income-card");
          if (netCard) {
            const isPositive = netIncome >= 0;
            netCard.innerHTML = `
          <p style="margin:0 0 8px 0; font-size:12px; opacity:0.9; font-weight:500;">💰 Net Income</p>
          <h3 style="margin:0; font-size:24px; font-weight:bold;">₱${Math.abs(netIncome).toLocaleString("en-US", { minimumFractionDigits: 2 })}${isPositive ? "" : " (Loss)"}</h3>
          <p style="margin:5px 0 0 0; font-size:11px; opacity:0.8;">This month (Revenue − Expenses)</p>
        `;
          }
        }

        // Destroy old chart before re-rendering
        if (expenseChartInstance) {
          expenseChartInstance.destroy();
          expenseChartInstance = null;
        }

        expenseChartInstance = new Chart(expCtx, {
          type: "bar",
          data: {
            labels: ["Inventory Expense", "Operating Expense", "Total Expense"],
            datasets: [
              {
                label: "Expenses (₱)",
                data: [inventory, operating, total],
                backgroundColor: [
                  "rgba(54,162,235,0.8)",
                  "rgba(255,99,132,0.8)",
                  "rgba(75,192,192,0.8)",
                ],
                borderRadius: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            plugins: {
              tooltip: {
                callbacks: {
                  label: (ctx) =>
                    "₱" +
                    ctx.parsed.y.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    }),
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (value) => "₱" + value.toLocaleString(),
                },
              },
            },
          },
        });
      } catch (err) {
        console.error("Failed to load expense summary:", err);
      }
    }

    // Wire up toggle buttons
    document.querySelectorAll("#expense-period-btns button").forEach((btn) => {
      btn.addEventListener("click", () =>
        updateExpenseChart(btn.dataset.period),
      );
    });

    // Load monthly by default (matches net income card period)
    await updateExpenseChart("monthly");

    // dri lng taman

    panels.dashboard.appendChild(receiptSection);

    console.log("✅ Dashboard rendered successfully");
  } catch (err) {
    console.error("❌ Dashboard error:", err);
    panels.dashboard.innerHTML = `
      <div style="text-align: center; padding: 40px; background: white; border-radius: 8px;">
        <h3 style="color: #dc3545;">Error Loading Dashboard</h3>
        <p style="margin: 20px 0; color: #666;">${err.message}</p>
        <button onclick="renderAccountingDashboard()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
        <button onclick="logout()" style="margin-left: 10px; padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Logout</button>
      </div>
    `;
  }
}

async function renderHousekeepingDashboard() {
  panels.dashboard.innerHTML = "";

  try {
    const response = await api("/housekeeping/tasks");

    const heading = document.createElement("h2");
    heading.textContent = "HOUSEKEEPING TASKS";
    panels.dashboard.appendChild(heading);

    if (response.tasks.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No rooms to clean.";
      panels.dashboard.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "housekeeping-grid";

    response.tasks.forEach((task) => {
      const card = document.createElement("div");
      card.className = "room-item";

      const isPending = task.status !== "ready";

      card.innerHTML = `
        <div>
          <strong>Room ${task.room_number}</strong>
          <small>Status: ${
            task.status === "ready" ? "Ready" : "Needs Cleaning"
          }</small>
        </div>

        ${
          isPending
            ? `
          <button class="clean-btn"
            data-id="${task.id}"
            style="
              margin-top:10px;
              padding:6px 10px;
              background:#4CAF50;
              color:white;
              border:none;
              border-radius:4px;
              cursor:pointer;
            ">
            ✅ Mark as Cleaned
          </button>
        `
            : `
          <small style="color:#2e7d32; margin-top:10px;">
            ✔️ Room Ready
          </small>
        `
        }
      `;

      // 👉 ADD CLICK EVENT
      if (isPending) {
        const btn = card.querySelector(".clean-btn");

        btn.addEventListener("click", async () => {
          const confirmed = confirm(
            `Mark Room ${task.room_number} as cleaned?`,
          );
          if (!confirmed) return;

          btn.disabled = true;
          btn.textContent = "Cleaning...";

          try {
            await api("/housekeeping/ready", {
              method: "POST",
              body: JSON.stringify({ taskId: task.id }),
            });

            // Update UI instantly
            card.innerHTML = `
              <strong>Room ${task.room_number}</strong>
              <small style="color:#2e7d32;">✔️ Room Ready</small>
            `;

            // Refresh dashboard
            setTimeout(() => renderHousekeepingDashboard(), 1000);
          } catch (err) {
            alert("Error: " + err.message);
            btn.disabled = false;
            btn.textContent = "✅ Mark as Cleaned";
          }
        });
      }

      grid.appendChild(card);
    });

    panels.dashboard.appendChild(grid);
  } catch (err) {
    panels.dashboard.innerHTML = `
      <p class="error">Error loading housekeeping tasks: ${err.message}</p>
    `;
  }
}

async function renderBookingPanel() {
  panels.booking.innerHTML = "";
  try {
    const [roomsData, foodData] = await Promise.all([
      api("/rooms/available"),
      api("/rooms/food-orders"),
    ]);

    // TOP SECTION: Room Rates & Menu
    // const topSection = document.createElement("div");
    // topSection.className = "dashboard-grid";

    // const menuCard = document.createElement("div");
    // menuCard.className = "card-section";
    // try {
    //   const menuData = await api("/menu");
    //   menuCard.innerHTML = "<h2>MENU</h2>";
    //   menuData.items.forEach((item) => {
    //     const itemDiv = document.createElement("div");
    //     itemDiv.className = "menu-item";
    //     itemDiv.innerHTML = `<span>${item.name}</span><span>₱${item.price}</span>`;
    //     menuCard.appendChild(itemDiv);
    //   });
    // } catch (err) {
    //   menuCard.innerHTML = "<h2>MENU</h2><p>Error loading menu</p>";
    // }
    // topSection.appendChild(menuCard);
    // panels.booking.appendChild(topSection);

    // MAIN SECTION: Available Rooms & Rooms With Orders
    const mainSection = document.createElement("div");
    mainSection.className = "rooms-grid";
    mainSection.style.gridTemplateColumns = "1fr 1fr";

    // Available Rooms Column
    const availableCol = document.createElement("div");
    availableCol.className = "card-column";
    availableCol.innerHTML = "<h2>AVAILABLE ROOMS</h2>";
    if (roomsData.rooms.length === 0) {
      availableCol.innerHTML += "<p>No available rooms.</p>";
    } else {
      roomsData.rooms.forEach((room) => {
        const item = document.createElement("div");
        item.className = "room-item";
        item.innerHTML = `
          <div>
            <strong>Room ${room.number}</strong>
            <small>${room.type}</small>
          </div>
          <div class="actions">
            <button onclick="openBookingForm({id: ${room.id}, number: '${room.number}', rate: ${room.rate}, type: '${room.type}'})">+</button>
          </div>
        `;
        availableCol.appendChild(item);
      });
    }
    mainSection.appendChild(availableCol);

    // Rooms With Orders Column
    const withOrdersCol = document.createElement("div");
    withOrdersCol.className = "card-column";
    withOrdersCol.innerHTML = "<h2>ROOMS WITH ORDERS</h2>";
    if (foodData.orders.length === 0) {
      withOrdersCol.innerHTML += "<p>No rooms with orders.</p>";
    } else {
      foodData.orders.forEach((order) => {
        const item = document.createElement("div");
        item.className = "room-item";
        item.innerHTML = `
          <div>
            <strong>Room ${order.room_number}</strong>
            <small>${order.food_order}</small>
          </div>
        `;
        withOrdersCol.appendChild(item);
      });
    }
    mainSection.appendChild(withOrdersCol);
    panels.booking.appendChild(mainSection);
  } catch (err) {
    panels.booking.innerHTML = `<p class="error">Error loading booking panel: ${err.message}</p>`;
  }
}

async function renderBillingPanel() {
  panels.occupiedRooms.innerHTML = "";
  try {
    const occupiedData = await api("/rooms/occupied");

    // OCCUPIED ROOMS Column
    const mainSection = document.createElement("div");
    mainSection.className = "card-column";
    mainSection.innerHTML = "<h2>OCCUPIED ROOMS</h2>";
    if (occupiedData.bookings.length === 0) {
      mainSection.innerHTML += "<p>No occupied rooms.</p>";
    } else {
      occupiedData.bookings.forEach((booking) => {
        const item = document.createElement("div");
        item.className = "room-item";
        item.innerHTML = `
        <div>
          <strong>Room ${booking.room_number}</strong>
          <small>${booking.guest_name}</small>
        </div>
        <div class="actions">
          <button onclick="openUpdateOrderForm(${booking.id}, ${booking.room_number}, '${booking.food_order || ""}')">+</button>
          <button class="pay-btn" onclick="openPaymentForm(${booking.id}, '${booking.guest_name}', '${booking.room_number}')">Pay</button>
          <button onclick="handleCheckout(${booking.id}, ${booking.rate}, '${booking.room_number}')">Check-out</button>
        </div>
      `;
        item.style.flexDirection = "column";
        item.style.alignItems = "flex-start";
        mainSection.appendChild(item);
      });
    }
    panels.occupiedRooms.appendChild(mainSection);

    // ← missing this line!
    const billingReceiptPanel = document.createElement("div");
    billingReceiptPanel.id = "receipt-panel";
    billingReceiptPanel.className = "receipt-modal hidden";
    panels.occupiedRooms.appendChild(billingReceiptPanel);
  } catch (err) {
    panels.occupiedRooms.innerHTML = `<p class="error">Error loading billing panel: ${err.message}</p>`;
  }
}

async function renderRooms() {
  panels.rooms.innerHTML = "<h2>Rooms</h2>";
  const role = session.user.role;
  if (role === "admin") {
    const [availableData, occupiedData, foodData] = await Promise.all([
      api("/rooms/available"),
      api("/rooms/occupied"),
      api("/rooms/food-orders"),
    ]);

    const availableSection = document.createElement("div");
    availableSection.innerHTML = "<h3>Available Rooms</h3>";
    if (availableData.rooms.length === 0) {
      availableSection.innerHTML += "<p>No available rooms.</p>";
    } else {
      const list = document.createElement("div");
      list.className = "card-list";
      availableData.rooms.forEach((room) => {
        const item = document.createElement("div");
        item.className = "card room-card";
        item.innerHTML = `<strong>Room ${room.number}</strong><span>${room.type}</span><span>₱${room.rate}</span>`;
        const button = document.createElement("button");
        button.textContent = "Reserve";
        button.addEventListener("click", () => openBookingForm(room));
        item.appendChild(button);
        list.appendChild(item);
      });
      availableSection.appendChild(list);
    }

    const occupiedSection = document.createElement("div");
    occupiedSection.innerHTML = "<h3>Occupied Rooms</h3>";
    if (occupiedData.bookings.length === 0) {
      occupiedSection.innerHTML += "<p>No occupied rooms.</p>";
    } else {
      const list = document.createElement("div");
      list.className = "card-list";
      occupiedData.bookings.forEach((booking) => {
        const item = document.createElement("div");
        item.className = "card room-card";
        item.innerHTML = `<strong>Room ${booking.room_number}</strong><span>${booking.guest_name}</span><span>${booking.contact}</span><span>Order: ${booking.food_order || "—"}</span><span>Serve: ${booking.serve_time || "—"}</span>`;
        const button = document.createElement("button");
        button.textContent = "+";
        button.addEventListener("click", () =>
          openUpdateOrderForm(
            booking.id,
            booking.room_number,
            booking.food_order || "",
          ),
        );
        item.appendChild(button);
        if (booking.updated) {
          const badge = document.createElement("span");
          badge.className = "badge success";
          badge.textContent = "updated";
          item.appendChild(badge);
        }
        list.appendChild(item);
      });
      occupiedSection.appendChild(list);
    }

    const foodSection = document.createElement("div");
    foodSection.innerHTML = "<h3>Rooms with Food Orders</h3>";
    if (foodData.orders.length === 0) {
      foodSection.innerHTML += "<p>No food order requests.</p>";
    } else {
      const list = document.createElement("div");
      list.className = "card-list";
      foodData.orders.forEach((order) => {
        const item = document.createElement("div");
        item.className = "card room-card";
        item.innerHTML = `<strong>Room ${order.room_number}</strong><span>Order: ${order.food_order}</span><span>Serve: ${order.serve_time}</span>`;
        const button = document.createElement("button");
        button.textContent = "View";
        button.addEventListener("click", () => openOrderDetail(order));
        item.appendChild(button);
        if (order.updated) {
          const badge = document.createElement("span");
          badge.className = "badge success";
          badge.textContent = "updated";
          item.appendChild(badge);
        }
        list.appendChild(item);
      });
      foodSection.appendChild(list);
    }

    panels.rooms.appendChild(availableSection);
    panels.rooms.appendChild(occupiedSection);
    panels.rooms.appendChild(foodSection);
  }
}

async function openBookingForm(room) {
  // Validate room object
  if (!room || !room.id || !room.number) {
    alert("❌ Error: Invalid room data. Please refresh and try again.");
    console.error("openBookingForm: Invalid room object →", room);
    return;
  }

  try {
    // ── 1. Fetch menu ──────────────────────────────────────────────
    let menuData;
    try {
      menuData = await api("/menu");
    } catch (menuErr) {
      alert(
        "❌ Failed to load menu. Please check your connection and try again.\n\nDetails: " +
          menuErr.message,
      );
      console.error("openBookingForm: /menu fetch failed →", menuErr);
      return;
    }

    if (!menuData || !Array.isArray(menuData.items)) {
      alert(
        "❌ Menu data is invalid or empty. Please contact your administrator.",
      );
      console.error("openBookingForm: Unexpected menu response →", menuData);
      return;
    }

    if (menuData.items.length === 0) {
      console.warn("openBookingForm: Menu is empty. No food items to display.");
    }

    // ── 2. Build modal HTML ────────────────────────────────────────
    const formHtml = `
      <div class="modal-overlay">
        <div class="modal">
          <h3>Reserve Room ${room.number}</h3>
          
          <div style="background:white; border-radius:8px; padding:14px; margin-bottom:16px; border-left:4px solid #1f3d7a;">
           <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="color:#667085; font-size:13px; font-weight:600;">Check In time:</span>
              <strong style="color:#1f3d7a;">2PM</strong>
            </div>
           <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="color:#667085; font-size:13px; font-weight:600;">Check Out time:</span>
              <strong style="color:#1f3d7a;">12PM</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="color:#667085; font-size:13px; font-weight:600;">Room Type:</span>
              <strong style="color:#1f3d7a;">${room.type || "Standard"}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:#667085; font-size:13px; font-weight:600;">Rate per Night:</span>
              <strong style="color:#1f9d55; font-size:16px;">₱${room.rate}</strong>
            </div>
          </div>

          <label>Guest Name
            <input id="guest_name" placeholder="e.g. Juan Dela Cruz" />
            <span class="field-error" id="err-guest_name" style="color:red; font-size:0.8em; display:none;"></span>
          </label>

          <label>Contact
            <input id="contact" placeholder="e.g. 09XXXXXXXXX" />
            <span class="field-error" id="err-contact" style="color:red; font-size:0.8em; display:none;"></span>
          </label>

          <label>Check-in Date & Time
            <input id="checkin_datetime" type="datetime-local" />
            <span class="field-error" id="err-checkin" style="color:red; font-size:0.8em; display:none;"></span>
          </label>

          <label>Food Orders</label>
          <div id="menu-items-container" class="food-grid"></div>
          <span class="field-error" id="err-food" style="color:red; font-size:0.8em; display:none;"></span>

          <div id="selected-items-display" class="selected-summary hidden">
            <div class="selected-summary-title">📋 Order Summary</div>
            <div class="selected-items-list"></div>
            <div class="food-total">
              <span class="food-total-label">Total:</span>
              <span class="food-total-amount">₱0.00</span>
            </div>
          </div>

          <label>Serve Time
            <input id="serve_time" type="time" />
            <span class="field-error" id="err-serve_time" style="color:red; font-size:0.8em; display:none;"></span>
          </label>

          <label>Valid ID <small style="color:#888;">(optional)</small>
            <input id="valid_id" type="file" accept=".jpg,.jpeg,.png,.pdf" />
            <span class="field-error" id="err-valid_id" style="color:red; font-size:0.8em; display:none;"></span>
          </label>

          <!-- General form error banner -->
          <label>Initial Payment <small style="color:#888;">(optional)</small>
            <input id="initial_payment" type="number" min="0" placeholder="Enter amount or leave blank" />
            <span class="field-error" id="err-initial_payment" style="color:red; font-size:0.8em; display:none;"></span>
          </label>
          <div id="form-error-banner" style="
            display:none; margin-top:10px; padding:10px;
            background:#fff0f0; border:1px solid #f5c6cb;
            border-radius:4px; color:#c0392b; font-size:0.85em;
          "></div>

          <div class="modal-actions">
            <button id="cancel-booking" class="secondary">Cancel</button>
            <button id="confirm-booking">Confirm</button>
          </div>
        </div>
      </div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = formHtml;
    document.body.appendChild(wrapper);

    // ── 3. Grab DOM references ─────────────────────────────────────
    const selectedItems = new Map();
    const menuContainer = wrapper.querySelector("#menu-items-container");
    const selectedDisplay = wrapper.querySelector("#selected-items-display");
    const selectedItemsList = selectedDisplay.querySelector(
      ".selected-items-list",
    );
    const selectedTotalAmount =
      selectedDisplay.querySelector(".food-total-amount");
    const formErrorBanner = wrapper.querySelector("#form-error-banner");

    // ── Helper: show / clear inline field errors ───────────────────
    function showFieldError(id, message) {
      const el = wrapper.querySelector(`#err-${id}`);
      if (!el) {
        console.warn(
          `showFieldError: No error element found for id "err-${id}"`,
        );
        return;
      }
      el.textContent = message;
      el.style.display = message ? "inline" : "none";
    }

    function clearFieldError(id) {
      showFieldError(id, "");
    }

    function showBanner(message) {
      formErrorBanner.textContent = message;
      formErrorBanner.style.display = "block";
    }

    function clearBanner() {
      formErrorBanner.textContent = "";
      formErrorBanner.style.display = "none";
    }

    // ── 4. Render food cards ───────────────────────────────────────
    menuData.items.forEach((item, index) => {
      // Guard against malformed menu items
      if (!item || !item.name || item.price == null) {
        console.warn(
          `openBookingForm: Skipping malformed menu item at index ${index} →`,
          item,
        );
        return;
      }

      const card = document.createElement("div");
      card.className = "food-card";
      card.dataset.itemName = item.name;
      card.dataset.itemPrice = item.price;

      card.innerHTML = `
        <div class="food-card-check">✓</div>
        <div class="food-name">${item.name}</div>
        <div class="food-price">₱${parseFloat(item.price).toFixed(2)}</div>
        <div class="qty-control" style="display: none;">
          <button type="button" class="qty-btn qty-minus">−</button>
          <input type="number" class="qty-input" min="1" max="99" value="1" />
          <button type="button" class="qty-btn qty-plus">+</button>
        </div>
        <div class="food-qty-display" style="display: none;">0 item</div>
      `;

      const qtyControl = card.querySelector(".qty-control");
      const qtyInput = card.querySelector(".qty-input");
      const qtyDisplay = card.querySelector(".food-qty-display");
      const minusBtn = card.querySelector(".qty-minus");
      const plusBtn = card.querySelector(".qty-plus");

      // Toggle card selection
      card.addEventListener("click", (e) => {
        // Don't toggle if clicking quantity buttons
        if (e.target.classList.contains("qty-btn") || e.target === qtyInput) {
          return;
        }

        clearFieldError("food");
        clearBanner();

        const isSelected = card.classList.contains("selected");

        if (!isSelected) {
          // Select the card
          card.classList.add("selected");
          qtyControl.style.display = "flex";
          selectedItems.set(item.name, {
            name: item.name,
            price: item.price,
            qty: 1,
          });
          qtyInput.value = 1;
          updateSelectedDisplay();
        } else {
          // Deselect the card
          card.classList.remove("selected");
          qtyControl.style.display = "none";
          selectedItems.delete(item.name);
          updateSelectedDisplay();
        }
      });

      // Quantity controls
      minusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = parseInt(qtyInput.value) || 1;
        if (current <= 1) {
          card.classList.remove("selected");
          qtyControl.style.display = "none";
          selectedItems.delete(item.name);
          updateSelectedDisplay();
        } else {
          const newQty = current - 1;
          qtyInput.value = newQty;
          selectedItems.get(item.name).qty = newQty;
          updateSelectedDisplay();
        }
      });

      plusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = parseInt(qtyInput.value) || 1;
        if (current < 99) {
          const newQty = current + 1;
          qtyInput.value = newQty;
          selectedItems.get(item.name).qty = newQty;
          updateSelectedDisplay();
        } else {
          showFieldError(
            "food",
            `⚠️ Max quantity (99) reached for "${item.name}".`,
          );
        }
      });

      qtyInput.addEventListener("change", (e) => {
        e.stopPropagation();
        let value = parseInt(qtyInput.value) || 1;
        if (value < 1) value = 1;
        if (value > 99) value = 99;
        qtyInput.value = value;
        selectedItems.get(item.name).qty = value;
        updateSelectedDisplay();
      });

      menuContainer.appendChild(card);
    });

    // ── 5. Update summary display ──────────────────────────────────
    function updateSelectedDisplay() {
      if (selectedItems.size === 0) {
        selectedDisplay.classList.add("hidden");
      } else {
        selectedDisplay.classList.remove("hidden");
        const entries = Array.from(selectedItems.values());
        let totalAmount = 0;

        // Build items list
        selectedItemsList.innerHTML = entries
          .map((e) => {
            const itemTotal = e.price * e.qty;
            totalAmount += itemTotal;
            return `
              <div class="selected-item">
                <span class="selected-item-name">${e.name}</span>
                <span class="selected-item-qty">x${e.qty}</span>
                <span class="selected-item-price">₱${itemTotal.toFixed(2)}</span>
              </div>
            `;
          })
          .join("");

        // Update total
        selectedTotalAmount.textContent = `₱${totalAmount.toFixed(2)}`;

        // Update card visuals
        menuContainer.querySelectorAll(".food-card").forEach((c) => {
          const itemName = c.dataset.itemName;
          if (selectedItems.has(itemName)) {
            const entry = selectedItems.get(itemName);
            const qtyDisplay = c.querySelector(".food-qty-display");
            qtyDisplay.textContent = `${entry.qty} item${entry.qty > 1 ? "s" : ""}`;
          }
        });
      }
    }

    // ── 6. Clear errors on input ───────────────────────────────────
    // ── 6. Clear errors on input ───────────────────────────────────
    wrapper.querySelector("#guest_name").addEventListener("input", () => {
      clearFieldError("guest_name");
      clearBanner();
    });
    wrapper.querySelector("#contact").addEventListener("input", () => {
      clearFieldError("contact");
      clearBanner();
    });
    wrapper
      .querySelector("#checkin_datetime")
      .addEventListener("change", () => {
        clearFieldError("checkin");
        clearBanner();
      });
    wrapper.querySelector("#serve_time").addEventListener("change", () => {
      clearFieldError("serve_time");
      clearBanner();
    });

    wrapper.querySelector("#valid_id").addEventListener("change", () => {
      clearFieldError("valid_id");
      clearBanner();
    });

    wrapper.querySelector("#initial_payment").addEventListener("input", () => {
      clearFieldError("initial_payment");
      clearBanner();
    });

    // ── 7. Cancel ──────────────────────────────────────────────────
    wrapper.querySelector("#cancel-booking").addEventListener("click", () => {
      wrapper.remove();
    });

    // ── 8. Confirm + Validation ────────────────────────────────────
    wrapper
      .querySelector("#confirm-booking")
      .addEventListener("click", async () => {
        // Clear previous errors
        ["guest_name", "contact", "checkin", "food", "serve_time"].forEach(
          clearFieldError,
        );
        clearBanner();

        const guest_name = wrapper.querySelector("#guest_name").value.trim();
        const contact = wrapper.querySelector("#contact").value.trim();
        const checkin_datetime =
          wrapper.querySelector("#checkin_datetime").value;
        const serve_time = wrapper.querySelector("#serve_time").value;

        const initial_payment_raw = wrapper
          .querySelector("#initial_payment")
          .value.trim();
        const initial_payment = initial_payment_raw
          ? parseFloat(initial_payment_raw)
          : 0;

        let hasError = false;
        const idFileInput = wrapper.querySelector("#valid_id");
        let idFileData = null;
        if (idFileInput.files.length > 0) {
          const file = idFileInput.files[0];

          // Validate file type
          const validTypes = ["image/jpeg", "image/png", "application/pdf"];
          if (!validTypes.includes(file.type)) {
            showFieldError(
              "valid_id",
              "⚠️ Only JPG, PNG, or PDF files are allowed.",
            );
            hasError = true;
          }

          // Validate file size (5MB max)
          if (file.size > 5 * 1024 * 1024) {
            showFieldError("valid_id", "⚠️ File size must be less than 5MB.");
            hasError = true;
          }

          // Read file as base64
          if (!hasError) {
            idFileData = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  filename: file.name,
                  data: reader.result.split(",")[1], // base64 only
                  type: file.type,
                });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }
        }

        // Guest name
        if (!guest_name) {
          showFieldError("guest_name", "⚠️ Guest name is required.");
          hasError = true;
        } else if (guest_name.length < 2) {
          showFieldError(
            "guest_name",
            "⚠️ Name must be at least 2 characters.",
          );
          hasError = true;
        }

        // Contact
        if (!contact) {
          showFieldError("contact", "⚠️ Contact number is required.");
          hasError = true;
        } else if (!/^[0-9+\-\s()]{7,15}$/.test(contact)) {
          showFieldError(
            "contact",
            "⚠️ Enter a valid contact number (7–15 digits).",
          );
          hasError = true;
        }

        // Check-in datetime
        if (!checkin_datetime) {
          showFieldError("checkin", "⚠️ Check-in date and time is required.");
          hasError = true;
        } else {
          const checkinDate = new Date(checkin_datetime);
          if (isNaN(checkinDate.getTime())) {
            showFieldError("checkin", "⚠️ Invalid date/time format.");
            hasError = true;
          } else if (checkinDate < new Date()) {
            showFieldError(
              "checkin",
              "⚠️ Check-in date must be in the future.",
            );
            hasError = true;
          }
        }

        // Serve time (only required if food was ordered)
        if (selectedItems.size > 0 && !serve_time) {
          showFieldError(
            "serve_time",
            "⚠️ Please set a serve time for your food order.",
          );
          hasError = true;
        }

        // partial payment validation

        if (
          initial_payment_raw &&
          (isNaN(initial_payment) || initial_payment < 0)
        ) {
          showFieldError(
            "initial_payment",
            "⚠️ Please enter a valid payment amount.",
          );
          hasError = true;
        }

        if (hasError) {
          showBanner("❌ Please fix the errors above before confirming.");
          return;
        }

        // ── 10. Submit booking ───────────────────────────────────────
        const confirmBtn = wrapper.querySelector("#confirm-booking");
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Saving...";

        const food_order = Array.from(selectedItems.values())
          .map((e) => `${e.name} x${e.qty}`)
          .join(", ");

        try {
          console.log("💰 Sending initial_payment:", initial_payment);
          console.log("📦 Full payload:", {
            roomId: room.id,
            guest_name,
            contact,
            checkin_datetime,
            food_order,
            serve_time,
            initial_payment,
          });
          await api("/rooms/book", {
            method: "POST",
            body: JSON.stringify({
              roomId: room.id,
              guest_name,
              contact,
              checkin_datetime,
              food_order,
              serve_time,
              initial_payment,
              valid_id: idFileData,
            }),
          });

          console.log(
            `✅ Room ${room.number} booked successfully for "${guest_name}".`,
          );
          wrapper.remove();
          renderAdminDashboard();
        } catch (bookErr) {
          console.error("openBookingForm: /rooms/book POST failed →", bookErr);

          confirmBtn.disabled = false;
          confirmBtn.textContent = "Confirm";

          // Show specific HTTP error messages if available
          const status = bookErr.status || bookErr.statusCode;
          if (status === 409) {
            showBanner(
              "❌ This room is already booked for the selected time. Please choose a different date/time.",
            );
          } else if (status === 400) {
            showBanner(
              "❌ Invalid booking data sent. Please review your inputs and try again.",
            );
          } else if (status === 401 || status === 403) {
            showBanner(
              "❌ You are not authorized to make this booking. Please log in again.",
            );
          } else if (status === 500) {
            showBanner(
              "❌ Server error. Please try again later or contact support.",
            );
          } else {
            showBanner(
              "❌ Booking failed: " +
                (bookErr.message || "Unknown error. Please try again."),
            );
          }
        }
      });
  } catch (err) {
    // Unexpected errors not caught by inner try/catch blocks
    alert(
      "❌ Unexpected error opening booking form.\n\nDetails: " + err.message,
    );
    console.error("openBookingForm: Unhandled error →", err);
  }
}

async function openUpdateOrderForm(bookingId, roomNumber, currentOrder) {
  try {
    const menuData = await api("/menu");

    const formHtml = `
      <div class="modal-overlay">
        <div class="modal">
          <h3>Add/Update Order for Room ${roomNumber}</h3>

          <label>Food Orders</label>
          <div id="menu-items-container" class="food-grid"></div>
          <span class="field-error" id="err-food" style="color:red; font-size:0.8em; display:none;"></span>

          <div id="selected-items-display" class="selected-summary hidden">
            <div class="selected-summary-title">📋 Order Summary</div>
            <div class="selected-items-list"></div>
            <div class="food-total">
              <span class="food-total-label">Total:</span>
              <span class="food-total-amount">₱0.00</span>
            </div>
          </div>

          <label>Serve Time
            <input id="serve_time" type="time" />
          </label>

          <div class="modal-actions">
            <button id="cancel-update" class="secondary">Cancel</button>
            <button id="confirm-update">Confirm</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = formHtml;
    document.body.appendChild(wrapper);

    // ── 3. Grab DOM references ─────────────────────────────────────
    const selectedItems = new Map();
    const menuContainer = wrapper.querySelector("#menu-items-container");
    const selectedDisplay = wrapper.querySelector("#selected-items-display");
    const selectedItemsList = selectedDisplay.querySelector(
      ".selected-items-list",
    );
    const selectedTotalAmount =
      selectedDisplay.querySelector(".food-total-amount");
    const formErrorBanner = wrapper.querySelector("#err-food");

    // Preload existing order
    const currentItems = currentOrder
      ? currentOrder.split(",").map((i) => i.trim())
      : [];

    // ── Helper: show / clear field errors ───────────────────
    function showFieldError(message) {
      formErrorBanner.textContent = message;
      formErrorBanner.style.display = message ? "inline" : "none";
    }

    function clearFieldError() {
      showFieldError("");
    }

    // ── 4. Render food cards ───────────────────────────────────────
    menuData.items.forEach((item, index) => {
      if (!item || !item.name || item.price == null) {
        console.warn(
          `openUpdateOrderForm: Skipping malformed menu item at index ${index}`,
          item,
        );
        return;
      }

      const card = document.createElement("div");
      card.className = "food-card";
      card.dataset.itemName = item.name;
      card.dataset.itemPrice = item.price;

      const isCurrentlySelected = currentItems.some((current) =>
        current.includes(item.name),
      );

      if (isCurrentlySelected) {
        // Parse existing quantity if format is "ItemName x2"
        const match = currentItems.find((c) => c.includes(item.name));
        const qtyMatch = match ? match.match(/x(\d+)/) : null;
        const existingQty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

        card.classList.add("selected");
        selectedItems.set(item.name, {
          name: item.name,
          price: item.price,
          qty: existingQty,
        });
      }

      card.innerHTML = `
        <div class="food-card-check">✓</div>
        <div class="food-name">${item.name}</div>
        <div class="food-price">₱${parseFloat(item.price).toFixed(2)}</div>
        <div class="qty-control" style="display: ${isCurrentlySelected ? "flex" : "none"};">
          <button type="button" class="qty-btn qty-minus">−</button>
          <input type="number" class="qty-input" min="1" max="99" value="${isCurrentlySelected ? selectedItems.get(item.name).qty : 1}" />
          <button type="button" class="qty-btn qty-plus">+</button>
        </div>
        <div class="food-qty-display" style="display: ${isCurrentlySelected ? "block" : "none"};">
          ${isCurrentlySelected ? selectedItems.get(item.name).qty + " item" : "0 item"}
        </div>
      `;

      const qtyControl = card.querySelector(".qty-control");
      const qtyInput = card.querySelector(".qty-input");
      const qtyDisplay = card.querySelector(".food-qty-display");
      const minusBtn = card.querySelector(".qty-minus");
      const plusBtn = card.querySelector(".qty-plus");

      // Toggle card selection
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("qty-btn") || e.target === qtyInput) {
          return;
        }

        clearFieldError();
        const isSelected = card.classList.contains("selected");

        if (!isSelected) {
          card.classList.add("selected");
          qtyControl.style.display = "flex";
          selectedItems.set(item.name, {
            name: item.name,
            price: item.price,
            qty: 1,
          });
          qtyInput.value = 1;
          updateSelectedDisplay();
        } else {
          card.classList.remove("selected");
          qtyControl.style.display = "none";
          selectedItems.delete(item.name);
          updateSelectedDisplay();
        }
      });

      // Quantity controls
      minusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = parseInt(qtyInput.value) || 1;
        if (current <= 1) {
          card.classList.remove("selected");
          qtyControl.style.display = "none";
          selectedItems.delete(item.name);
          updateSelectedDisplay();
        } else {
          const newQty = current - 1;
          qtyInput.value = newQty;
          selectedItems.get(item.name).qty = newQty;
          updateSelectedDisplay();
        }
      });

      plusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = parseInt(qtyInput.value) || 1;
        if (current < 99) {
          const newQty = current + 1;
          qtyInput.value = newQty;
          selectedItems.get(item.name).qty = newQty;
          updateSelectedDisplay();
        } else {
          showFieldError(`⚠️ Max quantity (99) reached for "${item.name}".`);
        }
      });

      qtyInput.addEventListener("change", (e) => {
        e.stopPropagation();
        let value = parseInt(qtyInput.value) || 1;
        if (value < 1) value = 1;
        if (value > 99) value = 99;
        qtyInput.value = value;
        selectedItems.get(item.name).qty = value;
        updateSelectedDisplay();
      });

      menuContainer.appendChild(card);
    });

    // ── 5. Update summary display ──────────────────────────────────
    function updateSelectedDisplay() {
      if (selectedItems.size === 0) {
        selectedDisplay.classList.add("hidden");
      } else {
        selectedDisplay.classList.remove("hidden");
        const entries = Array.from(selectedItems.values());
        let totalAmount = 0;

        selectedItemsList.innerHTML = entries
          .map((e) => {
            const itemTotal = e.price * e.qty;
            totalAmount += itemTotal;
            return `
              <div class="selected-item">
                <span class="selected-item-name">${e.name}</span>
                <span class="selected-item-qty">x${e.qty}</span>
                <span class="selected-item-price">₱${itemTotal.toFixed(2)}</span>
              </div>
            `;
          })
          .join("");

        selectedTotalAmount.textContent = `₱${totalAmount.toFixed(2)}`;

        menuContainer.querySelectorAll(".food-card").forEach((c) => {
          const itemName = c.dataset.itemName;
          if (selectedItems.has(itemName)) {
            const entry = selectedItems.get(itemName);
            const qtyDisplay = c.querySelector(".food-qty-display");
            qtyDisplay.textContent = `${entry.qty} item${entry.qty > 1 ? "s" : ""}`;
          }
        });
      }
    }

    // Initialize display
    updateSelectedDisplay();

    // Close modal
    wrapper
      .querySelector("#cancel-update")
      .addEventListener("click", () => wrapper.remove());

    // Confirm
    wrapper
      .querySelector("#confirm-update")
      .addEventListener("click", async () => {
        if (selectedItems.size === 0) {
          showFieldError("⚠️ Please select at least one food item.");
          return;
        }

        const food_order = Array.from(selectedItems.values())
          .map((e) => `${e.name} x${e.qty}`)
          .join(", ");
        const serve_time = wrapper.querySelector("#serve_time").value;

        try {
          await api("/rooms/update-order", {
            method: "POST",
            body: JSON.stringify({
              bookingId: bookingId,
              food_order,
              serve_time,
            }),
          });

          wrapper.remove();
          renderAdminDashboard();
        } catch (err) {
          showFieldError("❌ Failed to update order: " + err.message);
        }
      });
  } catch (err) {
    alert("❌ Error loading menu: " + err.message);
  }
}

function openOrderDetail(order) {
  const formHtml = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>Food order for room ${order.room_number}</h3>
        <p><strong>Order:</strong> ${order.food_order}</p>
        <p><strong>Serve time:</strong> ${order.serve_time || "Not set"}</p>
        <div class="modal-actions">
          <button id="close-order" class="secondary">Close</button>
        </div>
      </div>
    </div>`;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = formHtml;
  document.body.appendChild(wrapper);
  wrapper
    .querySelector("#close-order")
    .addEventListener("click", () => wrapper.remove());
}

async function showCheckout(bookingId, roomRate, roomNumber) {
  try {
    console.log(
      "🔍 showCheckout called with:",
      bookingId,
      roomRate,
      roomNumber,
    );

    const response = await api("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ bookingId }),
    });

    console.log("✅ checkout response:", response);

    const receipt = response.receipt;
    let receiptEl = document.getElementById("receipt-panel");

    // Crash-proof: receipt panel may not exist if Billing panel UI wasn't mounted yet
    if (!receiptEl) {
      const occupiedRoot = panels?.occupiedRooms;
      if (occupiedRoot) {
        receiptEl = document.createElement("div");
        receiptEl.id = "receipt-panel";
        receiptEl.className = "receipt-modal hidden";
        occupiedRoot.appendChild(receiptEl);
      }
    }

    if (!receiptEl) {
      // If still missing, just alert instead of crashing
      throw new Error("Receipt panel not found in DOM.");
    }

    receiptEl.innerHTML = `
      <div class="receipt" id="printable-receipt">

        <!-- Header -->
        <div class="receipt-header-block">
          <h2 class="receipt-hotel-name">PCC Home Suite Home</h2>
          <p class="receipt-address">Osmeña Street Zone 1</p>
          <p class="receipt-address">Koronadal City</p>
        </div>

        <div class="receipt-divider">────────────────────────</div>

        <!-- Receipt Meta -->
        <div class="receipt-meta">
          <div><span>Receipt No:</span> <strong>${receipt.receipt_number}</strong></div>
          <div><span>Cashier:</span> <strong>Admin</strong></div>
          <div><span>Date:</span> <strong>${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })}</strong></div>
          <div><span>Time:</span> <strong>${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</strong></div>
        </div>

        <div class="receipt-divider">────────────────────────</div>

        <!-- Guest Info -->
        <div class="receipt-guest">
          <div><span>Guest:</span> <strong>${receipt.guest_name}</strong></div>
          <div><span>Room:</span> <strong>${receipt.room_number}</strong></div>
        </div>

        <div class="receipt-divider">────────────────────────</div>

        <!-- Charges -->
        <div class="receipt-charges">
          <div class="receipt-line">
            <span>Room Charge</span>
            <span>₱${receipt.room_rate.toFixed(2)}</span>
          </div>
          ${
            receipt.food_items && receipt.food_items.length > 0
              ? receipt.food_items
                  .map(
                    (item) => `
                <div class="receipt-line">
                  <span>${item.name} x${item.qty}</span>
                  <span>₱${item.total.toFixed(2)}</span>
                </div>
              `,
                  )
                  .join("")
              : `<div class="receipt-line"><span>No Food Orders</span><span>₱0.00</span></div>`
          }
        </div>

        <div class="receipt-divider">────────────────────────</div>

        <!-- Total -->
        <div class="receipt-line receipt-total-line">
          <strong>TOTAL</strong>
          <strong>₱${receipt.total.toFixed(2)}</strong>
        </div>

        <div class="receipt-divider">────────────────────────</div>

        <!-- Payment History -->
        <div class="receipt-payments">
          ${
            receipt.payments && receipt.payments.length > 0
              ? receipt.payments
                  .map(
                    (p) => `
                <div class="receipt-line">
                  <span>${p.description}</span>
                  <span>₱${p.amount.toFixed(2)}</span>
                </div>
              `,
                  )
                  .join("")
              : `<div class="receipt-line"><span>Payment</span><span>₱${receipt.total.toFixed(2)}</span></div>`
          }
          <div class="receipt-line">
            <span>Total Paid</span>
            <span>₱${receipt.total_paid ? receipt.total_paid.toFixed(2) : receipt.total.toFixed(2)}</span>
          </div>
          <div class="receipt-line">
            <span>Change</span>
            <span>₱${receipt.change ? receipt.change.toFixed(2) : "0.00"}</span>
          </div>
        </div>

        <div class="receipt-divider">────────────────────────</div>

        <!-- Footer -->
        <div class="receipt-footer">
          <p>Thank you for staying with us!</p>
          <p>We hope to see you again.</p>
        </div>

        <!-- Action Buttons (hidden on print) -->
        <div class="receipt-actions no-print">
          <button onclick="printReceipt()">🖨️ Print</button>
          <button onclick="closeReceipt()" class="secondary">Close</button>
        </div>

      </div>
    `;

    receiptEl.classList.remove("hidden");
  } catch (err) {
    alert("Error during checkout: " + err.message);
  }
}

function printReceipt() {
  const receiptNode = document.getElementById("printable-receipt");
  if (!receiptNode) return;

  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return;

  // Clone DOM safely (reduces risk vs document.write with innerHTML)
  const clone = receiptNode.cloneNode(true);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - PCC Home Suite Home</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 13px;
            width: 300px;
            margin: 0 auto;
            padding: 10px;
          }
          .receipt-hotel-name {
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .receipt-address {
            text-align: center;
            font-size: 12px;
            color: #333;
          }
          .receipt-divider {
            text-align: center;
            margin: 6px 0;
            color: #555;
            letter-spacing: 1px;
          }
          .receipt-meta div,
          .receipt-guest div {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
          }
          .receipt-line {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
          }
          .receipt-total-line {
            font-size: 15px;
            margin: 4px 0;
          }
          .receipt-footer {
            text-align: center;
            margin-top: 8px;
            font-size: 12px;
            color: #444;
          }
          .receipt-footer p { margin: 2px 0; }
          .no-print { display: none !important; }
          .receipt-header-block { text-align: center; margin-bottom: 4px; }
        </style>
      </head>
      <body>
      </body>
    </html>
  `);

  printWindow.document.close();
  // Append cloned receipt after DOM is ready
  printWindow.document.body.appendChild(clone);

  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

function closeReceipt() {
  const receiptPanel = document.getElementById("receipt-panel");
  if (!receiptPanel) {
    // Billing panel may have been re-rendered already
    return;
  }

  receiptPanel.classList.add("hidden");
  receiptPanel.innerHTML = "";
  renderBillingPanel();
}

async function renderOrders() {
  panels.orders.innerHTML = "<h2>Food & Beverage Orders</h2>";
  const response = await api("/orders");
  if (response.orders.length === 0) {
    panels.orders.innerHTML += "<p>No food orders in the queue.</p>";
    return;
  }
  const list = document.createElement("div");
  list.className = "card-list";
  response.orders.forEach((order) => {
    const item = document.createElement("div");
    item.className = "card order-card";
    item.innerHTML = `<strong>Room ${order.room_number}</strong><span>Guest: ${order.guest_name || "N/A"}</span><span>Order: ${order.food_order}</span><span>Serve by: ${order.serve_time || "N/A"}</span><span>Status: ${order.status}</span>`;
    const button = document.createElement("button");
    button.textContent =
      order.status === "delivered" ? "Delivered" : "Mark Delivered";
    button.disabled = order.status === "delivered";
    button.addEventListener("click", async () => {
      await api("/orders/deliver", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });
      renderPanel("orders");
    });
    item.appendChild(button);
    if (order.updated) {
      const badge = document.createElement("span");
      badge.className = "badge success";
      badge.textContent = "updated";
      item.appendChild(badge);
    }
    list.appendChild(item);
  });
  panels.orders.appendChild(list);
}

async function renderReceipts() {
  panels.receipts.innerHTML = "<h2>Receipts</h2>";
  const response = await api("/receipts");
  if (response.receipts.length === 0) {
    panels.receipts.innerHTML += "<p>No receipts generated yet.</p>";
    return;
  }
  const table = document.createElement("table");
  table.innerHTML =
    "<thead><tr><th>Room</th><th>Guest</th><th>Room</th><th>Food</th><th>Total</th><th>Date</th></tr></thead>";
  const body = document.createElement("tbody");
  response.receipts.forEach((receipt) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${receipt.room_number}</td><td>${receipt.guest_name}</td><td>₱${receipt.room_rate}</td><td>₱${receipt.food_amount}</td><td>₱${receipt.total}</td><td>${receipt.created_at}</td>`;
    body.appendChild(row);
  });
  table.appendChild(body);
  panels.receipts.appendChild(table);
}

async function renderLedgerPage() {
  panels.ledger.innerHTML = "";
  try {
    const response = await api("/ledger");
    const monthYear = new Date().toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    // ── Pagination settings ────────────────────────────────────────
    const rowsPerPage = 20; // Show 20 rows per page
    let currentPage = 1;

    // ── Process all ledger data ────────────────────────────────────
    const balanceMap = {};
    let totalDebit = 0;
    let totalCredit = 0;
    const processedLedger = [];

    response.ledger.forEach((tx) => {
      const debit = tx.type === "charge" ? tx.amount : 0;
      const credit = tx.type === "credit" ? tx.amount : 0;
      totalDebit += debit;
      totalCredit += credit;

      const key = tx.booking_id
        ? `${tx.booking_id}`
        : `${tx.guest_name}_${tx.room_number}`;
      if (balanceMap[key] === undefined) balanceMap[key] = 0;
      balanceMap[key] += debit - credit;
      const rowBalance = balanceMap[key];

      const dateObj = new Date(tx.created_at);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
      });

      processedLedger.push({
        date: formattedDate,
        guest: tx.guest_name || "—",
        room: tx.room_number || "—",
        description: tx.description,
        debit,
        credit,
        balance: rowBalance,
      });
    });

    const totalPages = Math.ceil(processedLedger.length / rowsPerPage);

    // ── Function to render a specific page ──────────────────────────
    function renderPage(page) {
      // Clear and rebuild table
      const tableContainer = panels.ledger.querySelector(
        "#ledger-table-container",
      );
      if (tableContainer) tableContainer.remove();

      const table = document.createElement("table");
      table.className = "ledger-table";
      table.id = "ledger-table-container";
      table.innerHTML = `
        <thead>
          <tr><th colspan="7" style="text-align: center; font-size: 14px; padding: 12px;">Month: ${monthYear}</th></tr>
          <tr>
            <th>Date</th>
            <th>Guest Name</th>
            <th>Room No.</th>
            <th>Description</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Balance</th>
          </tr>
        </thead>
      `;

      // Calculate start and end index for this page
      const startIndex = (page - 1) * rowsPerPage;
      const endIndex = Math.min(
        startIndex + rowsPerPage,
        processedLedger.length,
      );
      const pageData = processedLedger.slice(startIndex, endIndex);

      let tableBody = "<tbody>";
      pageData.forEach((row) => {
        tableBody += `
          <tr>
            <td>${row.date}</td>
            <td>${row.guest}</td>
            <td>${row.room}</td>
            <td>${row.description}</td>
            <td>${row.debit > 0 ? "₱" + row.debit.toFixed(2) : "—"}</td>
            <td>${row.credit > 0 ? "₱" + row.credit.toFixed(2) : "—"}</td>
            <td>${row.balance > 0 ? "₱" + row.balance.toFixed(2) : "0"}</td>
          </tr>
        `;
      });
      tableBody += "</tbody>";

      table.innerHTML += tableBody;

      // Insert table before pagination controls
      const paginationContainer = panels.ledger.querySelector(
        "#pagination-container",
      );
      if (paginationContainer) {
        panels.ledger.insertBefore(table, paginationContainer);
      } else {
        panels.ledger.appendChild(table);
      }

      // Update pagination info
      const pageInfo = panels.ledger.querySelector("#page-info");
      if (pageInfo) {
        pageInfo.textContent = `Page ${page} of ${totalPages} (Showing ${startIndex + 1}-${endIndex} of ${processedLedger.length})`;
      }

      // Update button states
      const prevBtn = panels.ledger.querySelector("#prev-page");
      const nextBtn = panels.ledger.querySelector("#next-page");
      if (prevBtn) prevBtn.disabled = page === 1;
      if (nextBtn) nextBtn.disabled = page === totalPages;

      currentPage = page;
    }

    // ── Summary section ────────────────────────────────────────────
    const summary = document.createElement("div");
    summary.className = "ledger-summary";
    summary.innerHTML = `
      <p><strong>Total Monthly Charges:</strong> <span>₱${totalDebit.toFixed(2)}</span></p>
      <p><strong>Total Monthly Payments:</strong> <span>₱${totalCredit.toFixed(2)}</span></p>
      <p><strong>Outstanding Balance:</strong> <span>₱${Math.max(0, totalDebit - totalCredit).toFixed(2)}</span></p>
    `;
    panels.ledger.appendChild(summary);

    // ── Pagination controls ────────────────────────────────────────
    const paginationContainer = document.createElement("div");
    paginationContainer.id = "pagination-container";
    paginationContainer.style.cssText = `
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 6px;
      border: 1px solid #ddd;
    `;

    paginationContainer.innerHTML = `
      <button id="prev-page" style="
        padding: 8px 12px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">← Previous</button>

      <span id="page-info" style="
        font-weight: bold;
        color: #333;
        min-width: 200px;
        text-align: center;
      ">Page 1 of ${totalPages}</span>

      <button id="next-page" style="
        padding: 8px 12px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Next →</button>
    `;

    panels.ledger.appendChild(paginationContainer);

    // ── Render first page ──────────────────────────────────────────
    renderPage(1);

    // ── Event listeners for pagination ─────────────────────────────
    const prevBtn = panels.ledger.querySelector("#prev-page");
    const nextBtn = panels.ledger.querySelector("#next-page");

    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        renderPage(currentPage - 1);
        // Scroll to top of table
        panels.ledger.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        renderPage(currentPage + 1);
        // Scroll to top of table
        panels.ledger.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    // ── Keyboard navigation (arrow keys) ────────────────────────────
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && currentPage > 1) {
        renderPage(currentPage - 1);
      } else if (e.key === "ArrowRight" && currentPage < totalPages) {
        renderPage(currentPage + 1);
      }
    });
  } catch (err) {
    panels.ledger.innerHTML = `<p class="error">Error loading ledger: ${err.message}</p>`;
  }
}

async function renderHousekeeping() {
  panels.housekeeping.innerHTML = "<h2>Housekeeping</h2>";
  const response = await api("/housekeeping/tasks");
  if (response.tasks.length === 0) {
    panels.housekeeping.innerHTML += "<p>No housekeeping tasks yet.</p>";
    return;
  }
  const list = document.createElement("div");
  list.className = "card-list";
  response.tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "card task-card";
    item.innerHTML = `<strong>Room ${task.room_number}</strong><span>Status: ${task.status}</span>`;
    const button = document.createElement("button");
    button.textContent = task.status === "ready" ? "Ready" : "Mark Ready";
    button.disabled = task.status === "ready";
    button.addEventListener("click", async () => {
      await api("/housekeeping/ready", {
        method: "POST",
        body: JSON.stringify({ taskId: task.id }),
      });
      renderPanel("housekeeping");
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  panels.housekeeping.appendChild(list);
}

// ========================================
// EXPENSE MANAGEMENT PANEL
// ========================================
async function renderExpensePanel() {
  // ── SESSION VALIDATION ─────────────────────────────────────────────
  if (!session.token || !session.user) {
    console.error("❌ No session token found for expense panel");
    panels.expenses.innerHTML = `
      <div style="text-align: center; padding: 40px; background: white; border-radius: 8px;">
        <h3 style="color: #dc3545;">Authentication Required</h3>
        <p style="margin: 20px 0;">Please login to access the expense management.</p>
        <button onclick="logout()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Go to Login</button>
      </div>
    `;
    return;
  }

  panels.expenses.innerHTML = `
    <div class="expenses-container">
      <div class="expenses-header">
        <h2>💰 Expense Management</h2>
        <button id="add-expense-btn" class="primary-btn">➕ Add New Expense</button>
      </div>

      <div class="expenses-tabs">
        <button class="tab-btn active" data-tab="all-expenses">All Expenses</button>
        <button class="tab-btn" data-tab="inventory">Inventory Expenses</button>
        <button class="tab-btn" data-tab="operating">Operating Expenses</button>
        <button class="tab-btn" data-tab="inventory-items">Inventory Items</button>
      </div>

      <div id="all-expenses" class="tab-content active"></div>
      <div id="inventory" class="tab-content hidden"></div>
      <div id="operating" class="tab-content hidden"></div>
      <div id="inventory-items" class="tab-content hidden"></div>
    </div>

    <!-- MODAL FOR ADD/EDIT EXPENSE -->
    <div id="expense-modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modal-title">Add New Expense</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="expense-form">
          <div class="form-row">
            <div class="form-group">
              <label>Category *</label>
              <select id="category-select" required>
                <option value="">Select Category</option>
              </select>
            </div>
            <div class="form-group">
              <label>Expense Name *</label>
              <input type="text" id="expense-name" placeholder="e.g., Weekly Groceries" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Amount *</label>
              <input type="number" id="expense-amount" placeholder="0.00" step="0.01" required />
            </div>
            <div class="form-group">
              <label>Date *</label>
              <input type="date" id="expense-date" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Payment Method</label>
              <select id="payment-method">
                <option value="">Select Payment Method</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit Card">Credit Card</option>
              </select>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="expense-status">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>  

          <!-- INVENTORY EXPENSE DETAILS (shown when Inventory Expense is selected) -->
          <div id="inventory-details-section" class="hidden">
            <hr style="margin: 16px 0;" />
            <h4 style="margin-bottom: 12px;">📦 Inventory Line Items</h4>
            <div id="inventory-line-items"></div>
            <button type="button" id="add-line-item-btn" class="secondary-btn" style="margin-top: 8px;">➕ Add Item</button>
          </div>

          <!-- OPERATING EXPENSE DETAILS (shown when Operating Expense is selected) -->
          

          <div class="modal-actions">
            <button type="submit" class="primary-btn">Save Expense</button>
            <button type="button" class="secondary-btn modal-close-btn">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL FOR INVENTORY ITEMS -->
    <div id="inventory-modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="inventory-modal-title">Add New Inventory Item</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="inventory-form">
          <div class="form-row">
            <div class="form-group">
              <label>Item Name *</label>
              <input type="text" id="item-name" placeholder="e.g., Linens" required />
            </div>
            <div class="form-group">
              <label>Unit Price *</label>
              <input type="number" id="item-price" placeholder="0.00" step="0.01" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Stock Quantity *</label>
              <input type="number" id="item-quantity" placeholder="0" required />
            </div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="primary-btn">Save Item</button>
            <button type="button" class="secondary-btn modal-close-btn">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let currentEditExpenseId = null;
  let currentEditItemId = null;

  // ========== FUNCTIONS ==========

  // Set default date to today
  document.getElementById("expense-date").valueAsDate = new Date();

  // Load categories for dropdown
  async function loadCategories() {
    try {
      const data = await api("/expense-categories");
      const select = document.getElementById("category-select");
      data.categories.forEach((cat) => {
        const option = document.createElement("option");
        option.value = cat.category_id;
        option.textContent = cat.category_name;
        // store category name as data attribute for easy lookup
        option.dataset.name = cat.category_name;
        select.appendChild(option);
      });

      // Show/hide detail sections based on category
      select.addEventListener("change", () => {
        const selectedOption = select.options[select.selectedIndex];
        const categoryName = selectedOption.dataset.name || "";

        const inventorySection = document.getElementById(
          "inventory-details-section",
        );

        if (categoryName === "Inventory Expense") {
          inventorySection.classList.remove("hidden");
        } else {
          inventorySection.classList.add("hidden");
        }
      });
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }

  // Load and display all expenses
  async function loadExpenses() {
    try {
      const data = await api("/expenses");

      renderExpenseTable("all-expenses", data.expenses, true);
      renderExpenseTable(
        "inventory",
        data.expenses.filter((e) => e.category_name === "Inventory Expense"),
        false,
      );
      renderExpenseTable(
        "operating",
        data.expenses.filter((e) => e.category_name === "Operating Expense"),
        false,
      );
    } catch (err) {
      console.error("Failed to load expenses:", err);
      document.getElementById("all-expenses").innerHTML = `
      <p class='error'>❌ Failed to load expenses: ${err.message}</p>
    `;
    }
  }

  function renderExpenseTable(containerId, expenses, showActions) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    if (!expenses || expenses.length === 0) {
      container.innerHTML =
        "<p class='empty-state'>No expenses recorded yet.</p>";
      return;
    }

    const table = document.createElement("table");
    table.className = "expenses-table";
    table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Expense Name</th>
        <th>Category</th>
        <th>Amount</th>
        <th>Payment Method</th>
        <th>Status</th>
        ${showActions ? "<th>Actions</th>" : ""}
      </tr>
    </thead>
    <tbody></tbody>
  `;

    const tbody = table.querySelector("tbody");
    let totalAmount = 0;

    expenses.forEach((expense) => {
      totalAmount += parseFloat(expense.amount) || 0;
      const row = document.createElement("tr");
      row.innerHTML = `
      <td>${expense.expense_date}</td>
      <td>${expense.expense_name}</td>
      <td>${expense.category_name || "N/A"}</td>
      <td>₱${parseFloat(expense.amount).toFixed(2)}</td>
      <td>${expense.payment_method || "N/A"}</td>
      <td><span class="status-badge ${expense.status}">${expense.status}</span></td>
      ${
        showActions
          ? `
        <td>
          <button class="edit-expense-btn" data-id="${expense.expense_id}">✏️</button>
          <button class="delete-expense-btn" data-id="${expense.expense_id}">🗑️</button>
        </td>`
          : ""
      }
    `;
      tbody.appendChild(row);
    });

    const totalRow = document.createElement("tr");
    totalRow.className = "total-row";
    totalRow.innerHTML = `
    <td colspan="3"><strong>TOTAL</strong></td>
    <td><strong>₱${totalAmount.toFixed(2)}</strong></td>
    <td colspan="${showActions ? 3 : 2}"></td>
  `;
    tbody.appendChild(totalRow);

    container.appendChild(table);

    if (showActions) {
      container.querySelectorAll(".edit-expense-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          openEditExpenseModal(e.target.dataset.id);
        });
      });

      container.querySelectorAll(".delete-expense-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          if (confirm("Are you sure you want to delete this expense?")) {
            await deleteExpense(e.target.dataset.id);
          }
        });
      });
    }
  }
  // Open modal to add new expense
  document.getElementById("add-expense-btn").addEventListener("click", () => {
    currentEditExpenseId = null;
    document.getElementById("modal-title").textContent = "Add New Expense";
    document.getElementById("expense-form").reset();
    document.getElementById("expense-date").valueAsDate = new Date();
    document.getElementById("expense-modal").classList.remove("hidden");
  });

  document
    .getElementById("add-line-item-btn")
    .addEventListener("click", async () => {
      const itemsData = await api("/inventory-items");
      addLineItemRow(itemsData.items);
    });

  // Open modal to edit expense
  async function openEditExpenseModal(expenseId) {
    try {
      const data = await api(`/expenses/${expenseId}`);
      const expense = data.expense;

      currentEditExpenseId = expenseId;
      document.getElementById("modal-title").textContent = "Edit Expense";
      document.getElementById("category-select").value = expense.category_id;
      document.getElementById("expense-name").value = expense.expense_name;
      document.getElementById("expense-amount").value = expense.amount;
      document.getElementById("expense-date").value = expense.expense_date;
      document.getElementById("payment-method").value =
        expense.payment_method || "";
      document.getElementById("expense-status").value = expense.status;
      document.getElementById("expense-modal").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load expense:", err);
      alert("Failed to load expense details");
    }
  }

  // Handle form submission
  document
    .getElementById("expense-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const categorySelect = document.getElementById("category-select");
      const categoryName =
        categorySelect.options[categorySelect.selectedIndex].dataset.name || "";

      const expenseData = {
        category_id: categorySelect.value,
        expense_name: document.getElementById("expense-name").value,
        amount: document.getElementById("expense-amount").value,
        expense_date: document.getElementById("expense-date").value,
        payment_method: document.getElementById("payment-method").value,
        status: document.getElementById("expense-status").value,
      };

      try {
        if (currentEditExpenseId) {
          await api(`/expenses/${currentEditExpenseId}`, {
            method: "PUT",
            body: JSON.stringify(expenseData),
          });
          alert("Expense updated successfully!");
        } else {
          // Step 1: Create the main expense
          const result = await api("/expenses", {
            method: "POST",
            body: JSON.stringify(expenseData),
          });
          const expenseId = result.expense_id;

          // Step 2: Save category-specific details
          if (categoryName === "Inventory Expense") {
            const lineItems = document.querySelectorAll(".line-item-row");

            // Step 1: Validate all stock BEFORE saving anything
            for (const row of lineItems) {
              const item_id = row.querySelector(".line-item-select").value;
              const quantity = parseInt(
                row.querySelector(".line-item-qty").value,
              );
              const unit_cost = row.querySelector(".line-item-unit-cost").value;
              if (!item_id || !quantity || !unit_cost) continue;

              const stockCheck = await api("/inventory-items/deduct-stock", {
                method: "POST",
                body: JSON.stringify({ item_id, quantity, dry_run: true }), // check only
              });
            }

            // Step 2: Save details and deduct stock
            for (const row of lineItems) {
              const item_id = row.querySelector(".line-item-select").value;
              const quantity = parseInt(
                row.querySelector(".line-item-qty").value,
              );
              const unit_cost = row.querySelector(".line-item-unit-cost").value;
              const subtotal = row.querySelector(".line-item-subtotal").value;
              if (!item_id || !quantity || !unit_cost) continue;

              // Save expense detail
              await api("/inventory-expense-details", {
                method: "POST",
                body: JSON.stringify({
                  expense_id: expenseId,
                  item_id,
                  quantity,
                  unit_cost,
                  subtotal,
                }),
              });

              // ✅ Deduct stock
              try {
                await api("/inventory-items/deduct-stock", {
                  method: "POST",
                  body: JSON.stringify({ item_id, quantity }),
                });
              } catch (stockErr) {
                alert(`⚠️ Stock warning: ${stockErr.message}`);
                // Still continues — expense is saved, just stock deduction failed
              }
            }
          } else if (categoryName === "Operating Expense") {
            await api("/operating-expense-details", {
              method: "POST",
              body: JSON.stringify({
                expense_id: expenseId,
                bill_type: document.getElementById("operating-bill-type").value,
                provider: document.getElementById("operating-provider").value,
                billing_period: document.getElementById(
                  "operating-billing-period",
                ).value,
              }),
            });
          }

          alert("Expense added successfully!");
        }

        closeModal();
        loadExpenses();
      } catch (err) {
        console.error("Failed to save expense:", err);
        alert("Error: " + err.message);
      }
    });

  // Delete expense
  async function deleteExpense(expenseId) {
    try {
      await api(`/expenses/${expenseId}`, { method: "DELETE" });
      alert("Expense deleted successfully!");
      loadExpenses();
    } catch (err) {
      console.error("Failed to delete expense:", err);
      alert("Error: " + err.message);
    }
  }

  // Modal close handlers
  document.querySelectorAll(".modal-close, .modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });

  function closeModal() {
    document.getElementById("expense-modal").classList.add("hidden");
    document.getElementById("inventory-modal").classList.add("hidden");
    document.getElementById("expense-form").reset();
    document.getElementById("inventory-form").reset();
    document.getElementById("inventory-line-items").innerHTML = "";
    document
      .getElementById("inventory-details-section")
      .classList.add("hidden");
    currentEditExpenseId = null;
    currentEditItemId = null;
  }

  // ========== INVENTORY ITEMS ==========

  async function loadInventoryItems() {
    try {
      const data = await api("/inventory-items");
      const container = document.getElementById("inventory-items");
      container.innerHTML = "";

      const addBtn = document.createElement("button");
      addBtn.className = "primary-btn add-inventory-btn";
      addBtn.textContent = "➕ Add New Item";
      addBtn.style.marginBottom = "20px";
      addBtn.addEventListener("click", openAddInventoryModal);
      container.appendChild(addBtn);

      // if (!data.items || data.items.length === 0) {
      //   container.innerHTML +=
      //     "<p class='empty-state'>No inventory items yet.</p>";
      //   return;
      // }

      if (!data.items || data.items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No inventory items yet.";
        container.appendChild(empty); // ✅ use appendChild instead of innerHTML +=
        return;
      }

      const table = document.createElement("table");
      table.className = "expenses-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Unit Price</th>
            <th>Stock Quantity</th>
            <th>Total Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      `;

      const tbody = table.querySelector("tbody");
      let totalValue = 0;

      data.items.forEach((item) => {
        const itemTotal =
          parseFloat(item.unit_price) * parseInt(item.stock_quantity);
        totalValue += itemTotal;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.item_name}</td>
          <td>₱${parseFloat(item.unit_price).toFixed(2)}</td>
          <td>${item.stock_quantity}</td>
          <td>₱${itemTotal.toFixed(2)}</td>
          <td>
            <button class="edit-item-btn" data-id="${item.item_id}">✏️</button>
            <button class="delete-item-btn" data-id="${item.item_id}">🗑️</button>
          </td>
        `;
        tbody.appendChild(row);
      });

      const totalRow = document.createElement("tr");
      totalRow.className = "total-row";
      totalRow.innerHTML = `
        <td colspan="2"><strong>TOTAL INVENTORY VALUE</strong></td>
        <td></td>
        <td><strong>₱${totalValue.toFixed(2)}</strong></td>
        <td></td>
      `;
      tbody.appendChild(totalRow);

      container.appendChild(table);

      // Attach event listeners
      container.querySelectorAll(".edit-item-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const itemId = e.target.dataset.id;
          openEditInventoryModal(itemId);
        });
      });

      container.querySelectorAll(".delete-item-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const itemId = e.target.dataset.id;
          if (confirm("Are you sure you want to delete this item?")) {
            await deleteInventoryItem(itemId);
          }
        });
      });
    } catch (err) {
      console.error("Failed to load inventory items:", err);
      document.getElementById("inventory-items").innerHTML = `
        <p class='error'>❌ Failed to load inventory items: ${err.message}</p>
      `;
    }
  }

  function openAddInventoryModal() {
    currentEditItemId = null;
    document.getElementById("inventory-modal-title").textContent =
      "Add New Inventory Item";
    document.getElementById("inventory-form").reset();
    document.getElementById("inventory-modal").classList.remove("hidden");
  }

  async function openEditInventoryModal(itemId) {
    try {
      const data = await api(`/inventory-items`);
      const item = data.items.find((i) => i.item_id === parseInt(itemId));

      if (!item) throw new Error("Item not found");

      currentEditItemId = itemId;
      document.getElementById("inventory-modal-title").textContent =
        "Edit Inventory Item";
      document.getElementById("item-name").value = item.item_name;
      document.getElementById("item-price").value = item.unit_price;
      document.getElementById("item-quantity").value = item.stock_quantity;
      document.getElementById("inventory-modal").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load item:", err);
      alert("Failed to load item details");
    }
  }

  document
    .getElementById("inventory-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const itemData = {
        item_name: document.getElementById("item-name").value,
        unit_price: parseFloat(document.getElementById("item-price").value),
        stock_quantity: parseInt(
          document.getElementById("item-quantity").value,
        ),
      };

      try {
        if (currentEditItemId) {
          await api(`/inventory-items/${currentEditItemId}`, {
            method: "PUT",
            body: JSON.stringify(itemData),
          });
          alert("Item updated successfully!");
        } else {
          await api("/inventory-items", {
            method: "POST",
            body: JSON.stringify(itemData),
          });
          alert("Item added successfully!");
        }
        closeModal();
        loadInventoryItems();
      } catch (err) {
        console.error("Failed to save item:", err);
        alert("Error: " + err.message);
      }
    });

  async function deleteInventoryItem(itemId) {
    try {
      await api(`/inventory-items/${itemId}`, { method: "DELETE" });
      alert("Item deleted successfully!");
      loadInventoryItems();
    } catch (err) {
      console.error("Failed to delete item:", err);
      alert("Error: " + err.message);
    }
  }

  // Add a blank inventory line item row
  function addLineItemRow(itemsList = [], item = null) {
    const container = document.getElementById("inventory-line-items");
    const index = container.children.length;

    const row = document.createElement("div");
    row.className = "form-row line-item-row";
    row.style.alignItems = "flex-end";
    row.innerHTML = `
    <div class="form-group">
      <label>Item</label>
      <select class="line-item-select" data-index="${index}">
        <option value="">Select Item</option>
        ${itemsList
          .map(
            (i) => `
          <option value="${i.item_id}" data-price="${i.unit_price}" data-stock="${i.stock_quantity}"
            ${item && item.item_id === i.item_id ? "selected" : ""}>
            ${i.item_name} (₱${parseFloat(i.unit_price).toFixed(2)})
          </option>
        `,
          )
          .join("")}
      </select>
    </div>
    <div class="form-group">
      <label>Qty</label>
      <input type="number" class="line-item-qty" min="1" value="${item ? item.quantity : 1}" placeholder="1" />
    </div>
    <div class="form-group">
      <label>Unit Cost</label>
      <input type="number" class="line-item-unit-cost" step="0.01" value="${item ? item.unit_cost : ""}" placeholder="0.00" readonly />
    </div>
    <div class="form-group">
      <label>Subtotal</label>
      <input type="number" class="line-item-subtotal" step="0.01" value="${item ? item.subtotal : ""}" placeholder="0.00" readonly />
    </div>
    <div class="form-group" style="flex: 0;">
      <button type="button" class="remove-line-item-btn secondary-btn" style="padding: 6px 10px;">🗑️</button>
    </div>
  `;

    // Auto-fill unit cost when item is selected
    row.querySelector(".line-item-select").addEventListener("change", (e) => {
      const selectedOption = e.target.options[e.target.selectedIndex];
      const price = parseFloat(selectedOption.dataset.price) || 0;
      const qty = parseFloat(row.querySelector(".line-item-qty").value) || 1;
      row.querySelector(".line-item-unit-cost").value = price.toFixed(2);
      row.querySelector(".line-item-subtotal").value = (price * qty).toFixed(2);

      // ✅ ADD: Show current stock beside the select
      const stock = parseInt(selectedOption.dataset.stock) || 0;
      let stockLabel = row.querySelector(".stock-label");
      if (!stockLabel) {
        stockLabel = document.createElement("small");
        stockLabel.className = "stock-label";
        stockLabel.style.display = "block";
        stockLabel.style.marginTop = "4px";
        e.target.parentNode.appendChild(stockLabel);
      }
      stockLabel.textContent = `Stock available: ${stock}`;
      stockLabel.style.color = stock <= 5 ? "red" : "green";

      recalculateTotal();
    });

    // Recalculate subtotal when qty changes
    row.querySelector(".line-item-qty").addEventListener("input", () => {
      const price =
        parseFloat(row.querySelector(".line-item-unit-cost").value) || 0;
      const qty = parseFloat(row.querySelector(".line-item-qty").value) || 0;
      row.querySelector(".line-item-subtotal").value = (price * qty).toFixed(2);
      recalculateTotal();
    });

    // Remove row
    row.querySelector(".remove-line-item-btn").addEventListener("click", () => {
      row.remove();
      recalculateTotal();
    });

    container.appendChild(row);
  }

  // Recalculate total amount from line items
  function recalculateTotal() {
    const subtotals = document.querySelectorAll(".line-item-subtotal");
    let total = 0;
    subtotals.forEach((s) => (total += parseFloat(s.value) || 0));
    document.getElementById("expense-amount").value = total.toFixed(2);
  }

  // ========== TAB SWITCHING ==========

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.add("hidden");
      });
      const tabId = e.target.dataset.tab;
      document.getElementById(tabId).classList.remove("hidden");
    });
  });

  await loadExpenses();
  await loadCategories();
  await loadInventoryItems();
}

async function renderSalesPanel() {
  if (!session.token || !session.user) {
    panels.sales.innerHTML = `
      <div style="text-align:center;padding:40px;background:white;border-radius:8px;">
        <h3 style="color:#dc3545;">Authentication Required</h3>
        <button onclick="logout()" style="padding:10px 20px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Go to Login</button>
      </div>`;
    return;
  }

  panels.sales.innerHTML =
    '<div style="text-align:center;padding:40px;">Loading financial report...</div>';

  // ── HEADER ─────────────────────────────────────────────────────
  panels.sales.innerHTML = "";

  const header = document.createElement("div");
  header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;`;

  const title = document.createElement("h2");
  title.textContent = "📊 Financial Report";
  title.style.cssText = `margin:0;color:#2c3e50;font-size:22px;font-weight:700;`;

  // Month picker
  const now = new Date();
  const monthPicker = document.createElement("input");
  monthPicker.type = "month";
  monthPicker.id = "sales-month-picker";
  monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  monthPicker.style.cssText = `
    padding:8px 12px;border:1px solid #dee2e6;border-radius:6px;
    font-size:14px;cursor:pointer;color:#2c3e50;font-weight:500;
  `;

  // Print button
  const printBtn = document.createElement("button");
  printBtn.textContent = "🖨 Print Report";
  printBtn.style.cssText = `
  padding: 9px 18px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
`;
  printBtn.onclick = () => printSalesReport();

  const headerRight = document.createElement("div");
  headerRight.style.cssText = `display:flex;gap:10px;align-items:center;`;
  headerRight.appendChild(monthPicker);
  headerRight.appendChild(printBtn);

  header.appendChild(title);
  header.appendChild(headerRight);
  panels.sales.appendChild(header);

  // ── PERIOD TABS ────────────────────────────────────────────────
  const tabBar = document.createElement("div");
  tabBar.style.cssText = `display:flex;gap:4px;margin-bottom:20px;background:#f8f9fa;padding:4px;border-radius:8px;width:fit-content;`;
  tabBar.innerHTML = `
    <button data-period="daily"   class="report-tab" style="padding:8px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;background:#007bff;color:white;">DAILY</button>
    <button data-period="weekly"  class="report-tab" style="padding:8px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:13px;background:transparent;color:#6c757d;">WEEKLY</button>
    <button data-period="monthly" class="report-tab" style="padding:8px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:13px;background:transparent;color:#6c757d;">MONTHLY</button>
  `;
  panels.sales.appendChild(tabBar);

  // ── MAIN LAYOUT ────────────────────────────────────────────────
  const mainLayout = document.createElement("div");
  mainLayout.style.cssText = `display:grid;grid-template-columns:1fr 280px;gap:20px;align-items:start;`;

  // Left: Income Statement
  const statementCard = document.createElement("div");
  statementCard.id = "income-statement-card";
  statementCard.style.cssText = `background:white;border-radius:10px;border:1px solid #e0e0e0;box-shadow:0 2px 6px rgba(0,0,0,0.05);overflow:hidden;`;

  // Right: Sidebar
  const sidebar = document.createElement("div");
  sidebar.id = "report-sidebar";
  sidebar.style.cssText = `display:flex;flex-direction:column;gap:16px;`;

  mainLayout.appendChild(statementCard);
  mainLayout.appendChild(sidebar);
  panels.sales.appendChild(mainLayout);

  // ── STATE ──────────────────────────────────────────────────────
  let currentPeriod = "daily";

  // ── RENDER REPORT ──────────────────────────────────────────────
  async function loadReport(period, month) {
    // Update tab styles
    document.querySelectorAll(".report-tab").forEach((btn) => {
      const active = btn.dataset.period === period;
      btn.style.background = active ? "#007bff" : "transparent";
      btn.style.color = active ? "white" : "#6c757d";
      btn.style.fontWeight = active ? "600" : "500";
    });

    statementCard.innerHTML = `<div style="padding:40px;text-align:center;color:#7f8c8d;">Loading...</div>`;
    sidebar.innerHTML = `<div style="padding:20px;text-align:center;color:#7f8c8d;">Loading...</div>`;

    try {
      const data = await api(
        `/analytics/financial-report?month=${month}&period=${period}`,
      );
      window._salesReportData = data;
      renderStatement(data, period);
      renderSidebar(data, period);
    } catch (err) {
      statementCard.innerHTML = `<div style="padding:40px;text-align:center;color:#dc3545;">❌ Failed to load report: ${err.message}</div>`;
    }
  }

  // ── INCOME STATEMENT TABLE ─────────────────────────────────────
  function renderStatement(data, period) {
    const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
    const isNegative = data.netIncome < 0;

    const fmt = (n) =>
      "₱" +
      parseFloat(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    // Build expense rows HTML
    // Build expense rows HTML (API already returns one row per category)
    const expenseRowsHTML =
      data.expenses.length === 0
        ? `<tr><td colspan="2" style="padding:10px 16px;color:#7f8c8d;font-style:italic;">No expenses recorded.</td></tr>`
        : data.expenses
            .map(
              (exp) => `
  <tr style="border-bottom:1px solid #f5f5f5;">
    <td style="padding:9px 16px;color:#555;padding-left:28px;font-weight:700;">${exp.name}</td>
    <td style="padding:9px 16px;text-align:right;color:#e74c3c;">${fmt(exp.total)}</td>
  </tr>`,
            )
            .join("");
    statementCard.innerHTML = `
      <div style="background:#2c3e50;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:white;font-weight:700;font-size:15px;">📋 INCOME STATEMENT</span>
        <span style="color:#adb5bd;font-size:13px;">${periodLabel} Report — ${monthPicker.value}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6;">
            <th style="padding:10px 16px;text-align:left;color:#2c3e50;font-weight:700;">PARTICULARS</th>
            <th style="padding:10px 16px;text-align:right;color:#2c3e50;font-weight:700;">${periodLabel.toUpperCase()} (Actual)</th>
          </tr>
        </thead>
        <tbody>

          <!-- REVENUE -->
          <tr style="background:#eaf4fb;">
            <td colspan="2" style="padding:8px 16px;font-weight:700;color:#2980b9;font-size:13px;letter-spacing:0.5px;">REVENUE</td>
          </tr>
          <tr style="border-bottom:1px solid #f5f5f5;">
            <td style="padding:9px 16px;padding-left:28px;color:#555;font-weight:700;">🛏 Room Revenue</td>
            <td style="padding:9px 16px;text-align:right;color:#27ae60;">${fmt(data.revenue.room)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f5f5f5;">
            <td style="padding:9px 16px;padding-left:28px;color:#555;font-weight:700;">🍽 Food & Beverage</td>
            <td style="padding:9px 16px;text-align:right;color:#27ae60;">${fmt(data.revenue.food)}</td>
          </tr>
          <tr style="background:#f0faf4;border-top:2px solid #27ae60;">
            <td style="padding:10px 16px;font-weight:700;color:#2c3e50;">TOTAL REVENUE</td>
            <td style="padding:10px 16px;text-align:right;font-weight:700;color:#27ae60;">${fmt(data.revenue.total)}</td>
          </tr>

          <!-- EXPENSES -->
          <tr style="background:#fef9f0;">
            <td colspan="2" style="padding:8px 16px;font-weight:700;color:#e67e22;font-size:13px;letter-spacing:0.5px;">EXPENSES</td>
          </tr>
          ${expenseRowsHTML}
          <tr style="background:#fdf2f2;border-top:2px solid #e74c3c;">
            <td style="padding:10px 16px;font-weight:700;color:#2c3e50;">TOTAL EXPENSES</td>
            <td style="padding:10px 16px;text-align:right;font-weight:700;color:#e74c3c;">(${fmt(data.totalExpenses)})</td>
          </tr>

          <!-- NET INCOME -->
          <tr style="background:${isNegative ? "#fdf2f2" : "#f0faf4"};border-top:3px solid ${isNegative ? "#e74c3c" : "#27ae60"};">
            <td style="padding:14px 16px;font-weight:800;font-size:15px;color:#2c3e50;">NET INCOME</td>
            <td style="padding:14px 16px;text-align:right;font-weight:800;font-size:15px;color:${isNegative ? "#e74c3c" : "#27ae60"};">
              ${isNegative ? "(" : ""}${fmt(Math.abs(data.netIncome))}${isNegative ? ")" : ""}
            </td>
          </tr>

        </tbody>
      </table>
    `;
  }

  // ── SIDEBAR ────────────────────────────────────────────────────
  function renderSidebar(data, period) {
    sidebar.innerHTML = "";

    // Daily Overview card
    const overviewCard = document.createElement("div");
    overviewCard.style.cssText = `background:white;border-radius:10px;border:1px solid #e0e0e0;box-shadow:0 2px 6px rgba(0,0,0,0.05);overflow:hidden;`;
    overviewCard.innerHTML = `
      <div style="background:#2c3e50;padding:10px 16px;">
        <span style="color:white;font-weight:700;font-size:13px;">📊 DAILY OVERVIEW</span>
      </div>
      <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
        <div>
          <div style="font-size:11px;color:#7f8c8d;margin-bottom:4px;">Occ %</div>
          <div style="font-size:20px;font-weight:700;color:#2c3e50;">${data.sidebar.occupancyPct}%</div>
        </div>
        <div>
          <div style="font-size:11px;color:#7f8c8d;margin-bottom:4px;">ADR</div>
          <div style="font-size:20px;font-weight:700;color:#2c3e50;">₱${parseFloat(data.sidebar.adr || 0).toFixed(0)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#7f8c8d;margin-bottom:4px;">Daily Net</div>
          <div style="font-size:16px;font-weight:700;color:${data.netIncome >= 0 ? "#27ae60" : "#e74c3c"};">
            ₱${Math.abs(data.netIncome).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    `;
    sidebar.appendChild(overviewCard);

    // Weekly Trends sparkline
    const trendCard = document.createElement("div");
    trendCard.style.cssText = `background:white;border-radius:10px;border:1px solid #e0e0e0;box-shadow:0 2px 6px rgba(0,0,0,0.05);overflow:hidden;`;

    const trendValues = data.sidebar.weeklyTrend.map((d) =>
      parseFloat(d.total || 0),
    );
    const maxVal = Math.max(...trendValues, 1);
    const sparkBars =
      trendValues.length === 0
        ? `<p style="color:#7f8c8d;font-size:12px;text-align:center;padding:10px;">No data</p>`
        : trendValues
            .map((v, i) => {
              const h = Math.max(4, Math.round((v / maxVal) * 50));
              const date = data.sidebar.weeklyTrend[i]?.date || "";
              const day = date
                ? new Date(date).toLocaleDateString("en-US", {
                    weekday: "short",
                  })
                : "";
              return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
              <div style="width:100%;background:#e8f4fd;border-radius:3px;display:flex;align-items:flex-end;height:50px;">
                <div style="width:100%;height:${h}px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:3px;"></div>
              </div>
              <span style="font-size:9px;color:#7f8c8d;">${day}</span>
            </div>`;
            })
            .join("");

    trendCard.innerHTML = `
      <div style="background:#2c3e50;padding:10px 16px;">
        <span style="color:white;font-weight:700;font-size:13px;">📈 WEEKLY TRENDS</span>
      </div>
      <div style="padding:16px;">
        <div style="display:flex;gap:4px;align-items:flex-end;">${sparkBars}</div>
      </div>
    `;
    sidebar.appendChild(trendCard);

    // Monthly Performance card
    const monthlyTotal = parseFloat(data.revenue.total || 0);
    const budgetGoal = monthlyTotal > 0 ? monthlyTotal * 1.2 : 50000; // 20% above current as goal
    const progress = Math.min(
      100,
      Math.round((monthlyTotal / budgetGoal) * 100),
    );

    const perfCard = document.createElement("div");
    perfCard.style.cssText = `background:white;border-radius:10px;border:1px solid #e0e0e0;box-shadow:0 2px 6px rgba(0,0,0,0.05);overflow:hidden;`;
    perfCard.innerHTML = `
      <div style="background:#2c3e50;padding:10px 16px;">
        <span style="color:white;font-weight:700;font-size:13px;">🎯 MONTHLY PERFORMANCE</span>
      </div>
      <div style="padding:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;color:#7f8c8d;">Revenue Goal</span>
          <span style="font-size:12px;font-weight:600;color:#2c3e50;">₱${budgetGoal.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        </div>
        <div style="background:#e9ecef;border-radius:10px;height:10px;overflow:hidden;margin-bottom:8px;">
          <div style="width:${progress}%;height:100%;background:linear-gradient(90deg,#43e97b,#38f9d7);border-radius:10px;transition:width 0.5s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:11px;color:#7f8c8d;">Progressed</span>
          <span style="font-size:12px;font-weight:700;color:#27ae60;">${progress}% — ₱${monthlyTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        </div>
      </div>
    `;
    sidebar.appendChild(perfCard);
  }

  // ── WIRE UP EVENTS ─────────────────────────────────────────────
  tabBar.querySelectorAll(".report-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPeriod = btn.dataset.period;
      loadReport(currentPeriod, monthPicker.value);
    });
  });

  monthPicker.addEventListener("change", (e) => {
    loadReport(currentPeriod, e.target.value);
  });

  // ── INITIAL LOAD ───────────────────────────────────────────────
  await loadReport("daily", monthPicker.value);
}

function printSalesReport() {
  const data = window._salesReportData;
  if (!data) {
    alert(
      "No report loaded yet. Please wait for the report to finish loading.",
    );
    return;
  }

  const monthPicker = document.getElementById("sales-month-picker");
  const month = monthPicker?.value || "";
  const now = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const activeTab = document.querySelector(
    ".report-tab[style*='rgb(0, 123, 255)'], .report-tab[style*='#007bff']",
  );
  const period = activeTab ? activeTab.textContent.trim() : "Report";

  const fmt = (n) =>
    "₱" +
    parseFloat(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

  // Build expense rows HTML directly here
  // Build expense rows HTML (API already returns one row per category)
  const expenseRowsHTML =
    data.expenses.length === 0
      ? `<tr><td colspan="2" style="padding:10px 16px;color:#7f8c8d;font-style:italic;">No expenses recorded.</td></tr>`
      : data.expenses
          .map(
            (exp) => `
  <tr style="border-bottom:1px solid #f5f5f5;">
    <td style="padding:9px 16px;color:#555;padding-left:28px;font-weight:700;">${exp.name}</td>
    <td style="padding:9px 16px;text-align:right;color:#e74c3c;">${fmt(exp.total)}</td>
  </tr>`,
          )
          .join("");
  const isLoss = data.netIncome < 0;
  const netIncomeHTML = `
    <tr style="
      background:${isLoss ? "#fdf2f2" : "#f0faf4"};
      border-top:3px solid ${isLoss ? "#e74c3c" : "#27ae60"};
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      <td style="padding:14px 16px;font-weight:800;font-size:15px;">NET INCOME</td>
      <td style="padding:14px 16px;text-align:right;font-weight:800;font-size:15px;color:${isLoss ? "#e74c3c" : "#27ae60"};">
        ${isLoss ? "(" : ""}${fmt(Math.abs(data.netIncome))}${isLoss ? ")" : ""}
      </td>
    </tr>`;

  const printWindow = window.open("", "_blank", "width=800,height=600");
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Financial Report - ${month}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 13px;
          color: #2c3e50;
          padding: 40px;
        }
        .doc-header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 3px solid #2c3e50;
        }
        .doc-header h1 {
          font-size: 20px;
          font-weight: 800;
          color: #2c3e50;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .doc-header h2 {
          font-size: 15px;
          font-weight: 600;
          color: #555;
          margin-bottom: 8px;
        }
        .doc-header p { font-size: 12px; color: #7f8c8d; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        tbody tr { border-bottom: 1px solid #f0f0f0; }
        tbody td { padding: 9px 16px; }
        tbody td:last-child { text-align: right; }
        .signature-line {
          margin-top: 60px;
          display: flex;
          justify-content: space-around;
          font-size: 12px;
        }
        .signature-line div { text-align: center; width: 180px; }
        .signature-line div .line {
          border-top: 1px solid #2c3e50;
          margin-bottom: 6px;
        }
        .doc-footer {
          margin-top: 30px;
          padding-top: 16px;
          border-top: 1px solid #dee2e6;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #7f8c8d;
        }
        @media print {
          body { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="doc-header">
        <h1>🏨 HOTEL MANAGEMENT SYSTEM</h1>
        <h2>FINANCIAL REPORT — ${period} (${month})</h2>
        <p>Generated: ${now}</p>
      </div>

      <table>
        <thead>
          <tr style="background:#2c3e50;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <th style="padding:10px 16px;text-align:left;color:white;font-weight:700;">PARTICULARS</th>
            <th style="padding:10px 16px;text-align:right;color:white;font-weight:700;">${period} (Actual)</th>
          </tr>
        </thead>
        <tbody>

          <!-- REVENUE SECTION -->
          <tr style="background:#eaf4fb;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <td colspan="2" style="padding:8px 16px;font-weight:700;color:#2980b9;font-size:12px;letter-spacing:0.5px;">REVENUE</td>
          </tr>
          <tr>
            <td style="padding:9px 16px;padding-left:28px;color:#555;font-weight:700;">🛏 Room Revenue</td>
            <td style="padding:9px 16px;text-align:right;color:#27ae60;">${fmt(data.revenue.room)}</td>
          </tr>
          <tr>
            <td style="padding:9px 16px;padding-left:28px;color:#555;font-weight:700;">🍽 Food & Beverage</td>
            <td style="padding:9px 16px;text-align:right;color:#27ae60;">${fmt(data.revenue.food)}</td>
          </tr>
          <tr style="background:#f0faf4;border-top:2px solid #27ae60;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <td style="padding:10px 16px;font-weight:700;">TOTAL REVENUE</td>
            <td style="padding:10px 16px;text-align:right;font-weight:700;color:#27ae60;">${fmt(data.revenue.total)}</td>
          </tr>

          <!-- EXPENSES SECTION -->
          <tr style="background:#fef9f0;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <td colspan="2" style="padding:8px 16px;font-weight:700;color:#e67e22;font-size:12px;letter-spacing:0.5px;">EXPENSES</td>
          </tr>
          ${expenseRowsHTML}
          <tr style="background:#fdf2f2;border-top:2px solid #e74c3c;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <td style="padding:10px 16px;font-weight:700;">TOTAL EXPENSES</td>
            <td style="padding:10px 16px;text-align:right;font-weight:700;color:#e74c3c;">(${fmt(data.totalExpenses)})</td>
          </tr>

          <!-- NET INCOME -->
          ${netIncomeHTML}

        </tbody>
      </table>

      <div class="signature-line">
        <div><div class="line"></div>Prepared by</div>
        <div><div class="line"></div>Reviewed by</div>
        <div><div class="line"></div>Approved by</div>
      </div>

      <div class="doc-footer">
        <span>Hotel Management System — Financial Report</span>
        <span>Printed: ${now}</span>
      </div>

      <script>
        setTimeout(() => { window.print(); }, 400);
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

async function renderPanel(panelKey) {
  const role = session.user.role;
  if (panelKey === "dashboard") {
    if (role === "admin") {
      await renderAdminDashboard();
    } else if (role === "food-beverage") {
      await renderFoodBeverageDashboard();
    } else if (role === "accounting") {
      await renderAccountingDashboard();
    } else if (role === "housekeeping") {
      await renderHousekeepingDashboard();
    }
  } else if (panelKey === "ledger") {
    await renderLedgerPage();
  } else if (panelKey === "booking") {
    await renderBookingPanel();
  } else if (panelKey === "occupiedRooms") {
    await renderBillingPanel();
  } else if (panelKey === "expenses") {
    await renderExpensePanel();
  } else if (panelKey === "sales") {
    // ← ADD THIS
    await renderSalesPanel();
  }
}

function buildNavigation() {
  const role = session.user.role;
  const navItems = [{ title: "Dashboard", panel: "dashboard" }];
  if (role === "admin") {
    navItems.push({ title: "Booking", panel: "booking" });
    navItems.push({ title: "Billing", panel: "occupiedRooms" });
    navItems.push({ title: "Expenses", panel: "expenses" });
  }
  if (role === "accounting") {
    navItems.push({ title: "Ledger", panel: "ledger" });
    navItems.push({ title: "Sales", panel: "sales" });
  }
  // Show Expenses for all authenticated roles
  // navItems.push({ title: "Expenses", panel: "expenses" });
  setNav(navItems);
  roleLabel.textContent = `${session.user.name} (${session.user.department})`;
}

async function initializeApp() {
  loadSession();
  if (!session.token || !session.user) {
    showView("login");
    return;
  }
  try {
    await api("/user");
    showView("app");
    buildNavigation();
    showPanel("dashboard");
    renderPanel("dashboard");
  } catch (err) {
    clearSession();
    showView("login");
    loginError.textContent = "Session expired. Please login again.";
  }
}

async function openPaymentForm(bookingId, guestName, roomNumber) {
  // ── Fetch remaining balance for this booking ──────────────────
  let remaining = 0;
  try {
    const data = await api(`/ledger/balance/${bookingId}`);
    remaining = data.remaining;
  } catch (err) {
    alert("❌ Failed to load balance. Please try again.");
    return;
  }

  if (remaining <= 0) {
    alert("✅ This guest has no outstanding balance. Fully paid!");
    return;
  }

  // ── Build modal ───────────────────────────────────────────────
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>Record Payment</h3>
        <p style="margin-bottom: 12px;">
          <strong>Guest:</strong> ${guestName} &nbsp;|&nbsp;
          <strong>Room:</strong> ${roomNumber}
        </p>

        <div style="
          background: #fff8e1; border: 1px solid #ffe082;
          border-radius: 6px; padding: 10px 14px; margin-bottom: 16px;
        ">
          <strong>Outstanding Balance: </strong>
          <span style="color: #e65100; font-size: 1.1em;">₱${remaining.toFixed(2)}</span>
        </div>

        <label>Amount to Pay
          <input id="pay-amount" type="number" min="1" max="${remaining}"
            placeholder="Enter amount" style="width: 100%;" />
          <span id="err-pay-amount" style="color:red; font-size:0.8em; display:none;"></span>
        </label>

        <div id="pay-banner" style="
          display:none; margin-top:10px; padding:10px;
          background:#fff0f0; border:1px solid #f5c6cb;
          border-radius:4px; color:#c0392b; font-size:0.85em;
        "></div>

        <div class="modal-actions">
          <button id="cancel-pay" class="secondary">Cancel</button>
          <button id="confirm-pay">Confirm Payment</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  wrapper.querySelector("#cancel-pay").addEventListener("click", () => {
    wrapper.remove();
  });

  wrapper.querySelector("#confirm-pay").addEventListener("click", async () => {
    const amountInput = wrapper.querySelector("#pay-amount");
    const errEl = wrapper.querySelector("#err-pay-amount");
    const banner = wrapper.querySelector("#pay-banner");
    const amount = parseFloat(amountInput.value);

    // ── Validate ──────────────────────────────────────────────
    errEl.style.display = "none";
    banner.style.display = "none";

    if (!amountInput.value || isNaN(amount) || amount <= 0) {
      errEl.textContent = "⚠️ Please enter a valid amount.";
      errEl.style.display = "inline";
      return;
    }
    if (amount > remaining) {
      errEl.textContent = `⚠️ Amount cannot exceed the outstanding balance of ₱${remaining.toFixed(2)}.`;
      errEl.style.display = "inline";
      return;
    }

    // ── Submit payment ────────────────────────────────────────
    const confirmBtn = wrapper.querySelector("#confirm-pay");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving...";

    try {
      const result = await api("/ledger/payment", {
        method: "POST",
        body: JSON.stringify({
          bookingId,
          amount,
          guest_name: guestName,
          room_number: roomNumber,
        }),
      });

      wrapper.remove();
      alert(
        `✅ ${result.description} of ₱${amount.toFixed(2)} recorded successfully!`,
      );
      renderAdminDashboard();
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm Payment";
      banner.textContent =
        "❌ Failed to record payment: " + (err.message || "Unknown error.");
      banner.style.display = "block";
    }
  });
}

async function handleCheckout(bookingId, rate, roomNumber) {
  // Check remaining balance first
  try {
    const data = await api(`/ledger/balance/${bookingId}`);
    if (data.remaining > 0) {
      alert(
        `❌ Cannot check out. This guest still has an outstanding balance of ₱${data.remaining.toFixed(2)}.\n\nPlease record full payment first.`,
      );
      return;
    }
  } catch (err) {
    alert("❌ Failed to verify balance. Please try again.");
    return;
  }

  // Balance is 0 — proceed to checkout
  showCheckout(bookingId, rate, roomNumber);
}

// loginForm.addEventListener("submit", async (event) => {
//   event.preventDefault();
//   loginError.textContent = "";
//   const email = document.getElementById("email").value.trim();
//   const password = document.getElementById("password").value.trim();
//   try {
//     const response = await api("/login", {
//       method: "POST",
//       body: JSON.stringify({ email, password }),
//     });
//     saveSession(response.token, response.user);
//     buildNavigation();
//     showView("app");
//     showPanel("dashboard");
//     renderPanel("dashboard");
//   } catch (err) {
//     loginError.textContent = err.message;
//   }
// });

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  console.log("Attempting login..."); // Debug

  try {
    const response = await api("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    console.log("Login response received:", response); // Debug

    if (response.token) {
      console.log("Token received:", response.token.substring(0, 20) + "..."); // Debug
      saveSession(response.token, response.user);
      console.log("Session saved, token exists?", !!session.token); // Debug
      buildNavigation();
      showView("app");
      showPanel("dashboard");
      renderPanel("dashboard");
    } else {
      console.error("No token in response:", response);
      throw new Error("No token received from server");
    }
  } catch (err) {
    console.error("Login error:", err);
    loginError.textContent = err.message;
  }
});

const sidebarToggle = document.getElementById("sidebar-toggle");
const appSidebar = document.querySelector(".sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

sidebarToggle?.addEventListener("click", () => {
  appSidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("visible");
});

sidebarOverlay?.addEventListener("click", () => {
  appSidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
});

document.getElementById("nav-links")?.addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    appSidebar.classList.remove("open");
    sidebarOverlay.classList.remove("visible");
  }
});

logoutButton.addEventListener("click", () => {
  clearSession();
  showView("login");
});

initializeApp();
