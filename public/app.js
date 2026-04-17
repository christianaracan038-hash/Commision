const API_BASE = '/api';
const views = {
  login: document.getElementById('login-view'),
  app: document.getElementById('app-view')
};
const panels = {
  dashboard: document.getElementById('dashboard-view'),
  rooms: document.getElementById('rooms-view'),
  billing: document.getElementById('billing-view'),
  orders: document.getElementById('orders-view'),
  receipts: document.getElementById('receipts-view'),
  ledger: document.getElementById('ledger-view'),
  housekeeping: document.getElementById('housekeeping-view')
};
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const navLinks = document.getElementById('nav-links');
const roleLabel = document.getElementById('role-label');
const logoutButton = document.getElementById('logout-button');

let session = { token: null, user: null };

function saveSession(token, user) {
  session.token = token;
  session.user = user;
  localStorage.setItem('hotel-session', JSON.stringify(session));
}

function loadSession() {
  const stored = localStorage.getItem('hotel-session');
  if (stored) {
    session = JSON.parse(stored);
  }
}

function clearSession() {
  session = { token: null, user: null };
  localStorage.removeItem('hotel-session');
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  if (session.token) headers['x-session-token'] = session.token;
  const response = await fetch(API_BASE + path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showView(name) {
  views.login.classList.toggle('active', name === 'login');
  views.app.classList.toggle('active', name !== 'login');
}

function showPanel(panelName) {
  Object.values(panels).forEach((panel) => panel.classList.add('hidden'));
  panels[panelName].classList.remove('hidden');
}

function setNav(items) {
  navLinks.innerHTML = '';
  items.forEach(({ title, panel }) => {
    const button = document.createElement('button');
    button.textContent = title;
    button.addEventListener('click', () => {
      showPanel(panel);
      renderPanel(panel);
    });
    navLinks.appendChild(button);
  });
}

function renderDashboard(data) {
  panels.dashboard.innerHTML = '<h2>Home Dashboard</h2>';
  const container = document.createElement('div');
  container.className = 'overview-grid';
  Object.entries(data.overview).forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'info-card';
    card.innerHTML = `<strong>${label.replace(/([A-Z])/g, ' $1')}</strong><span>${value}</span>`;
    container.appendChild(card);
  });
  panels.dashboard.appendChild(container);
}

async function renderRooms() {
  panels.rooms.innerHTML = '<h2>Rooms</h2>';
  const role = session.user.role;
  if (role === 'admin') {
    const [availableData, occupiedData, foodData] = await Promise.all([
      api('/rooms/available'),
      api('/rooms/occupied'),
      api('/rooms/food-orders')
    ]);

    const availableSection = document.createElement('div');
    availableSection.innerHTML = '<h3>Available Rooms</h3>';
    if (availableData.rooms.length === 0) {
      availableSection.innerHTML += '<p>No available rooms.</p>';
    } else {
      const list = document.createElement('div');
      list.className = 'card-list';
      availableData.rooms.forEach((room) => {
        const item = document.createElement('div');
        item.className = 'card room-card';
        item.innerHTML = `<strong>Room ${room.number}</strong><span>${room.type}</span><span>₱${room.rate}</span>`;
        const button = document.createElement('button');
        button.textContent = 'Reserve';
        button.addEventListener('click', () => openBookingForm(room));
        item.appendChild(button);
        list.appendChild(item);
      });
      availableSection.appendChild(list);
    }

    const occupiedSection = document.createElement('div');
    occupiedSection.innerHTML = '<h3>Occupied Rooms</h3>';
    if (occupiedData.bookings.length === 0) {
      occupiedSection.innerHTML += '<p>No occupied rooms.</p>';
    } else {
      const list = document.createElement('div');
      list.className = 'card-list';
      occupiedData.bookings.forEach((booking) => {
        const item = document.createElement('div');
        item.className = 'card room-card';
        item.innerHTML = `<strong>Room ${booking.room_number}</strong><span>${booking.guest_name}</span><span>${booking.contact}</span><span>Order: ${booking.food_order || '—'}</span><span>Serve: ${booking.serve_time || '—'}</span>`;
        const button = document.createElement('button');
        button.textContent = '+';
        button.addEventListener('click', () => openUpdateOrderForm(booking));
        item.appendChild(button);
        if (booking.updated) {
          const badge = document.createElement('span');
          badge.className = 'badge success';
          badge.textContent = 'updated';
          item.appendChild(badge);
        }
        list.appendChild(item);
      });
      occupiedSection.appendChild(list);
    }

    const foodSection = document.createElement('div');
    foodSection.innerHTML = '<h3>Rooms with Food Orders</h3>';
    if (foodData.orders.length === 0) {
      foodSection.innerHTML += '<p>No food order requests.</p>';
    } else {
      const list = document.createElement('div');
      list.className = 'card-list';
      foodData.orders.forEach((order) => {
        const item = document.createElement('div');
        item.className = 'card room-card';
        item.innerHTML = `<strong>Room ${order.room_number}</strong><span>Order: ${order.food_order}</span><span>Serve: ${order.serve_time}</span>`;
        const button = document.createElement('button');
        button.textContent = 'View';
        button.addEventListener('click', () => openOrderDetail(order));
        item.appendChild(button);
        if (order.updated) {
          const badge = document.createElement('span');
          badge.className = 'badge success';
          badge.textContent = 'updated';
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

function openBookingForm(room) {
  const formHtml = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>Confirm room ${room.number}</h3>
        <label>Guest Name<input id="guest_name" /></label>
        <label>Contact<input id="contact" /></label>
        <label>Check-in Date & Time<input id="checkin_datetime" type="datetime-local" /></label>
        <label>Food Orders<textarea id="food_order"></textarea></label>
        <label>Serve Time<input id="serve_time" type="time" /></label>
        <div class="modal-actions">
          <button id="cancel-booking" class="secondary">Cancel</button>
          <button id="confirm-booking">Confirm</button>
        </div>
      </div>
    </div>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = formHtml;
  document.body.appendChild(wrapper);
  wrapper.querySelector('#cancel-booking').addEventListener('click', () => wrapper.remove());
  wrapper.querySelector('#confirm-booking').addEventListener('click', async () => {
    const guest_name = wrapper.querySelector('#guest_name').value.trim();
    const contact = wrapper.querySelector('#contact').value.trim();
    const checkin_datetime = wrapper.querySelector('#checkin_datetime').value;
    const food_order = wrapper.querySelector('#food_order').value.trim();
    const serve_time = wrapper.querySelector('#serve_time').value;
    if (!guest_name || !contact || !checkin_datetime) return alert('Complete guest name, contact and check-in date/time.');
    await api('/rooms/book', {
      method: 'POST',
      body: JSON.stringify({ roomId: room.id, guest_name, contact, checkin_datetime, food_order, serve_time })
    });
    wrapper.remove();
    renderPanel('rooms');
  });
}

function openUpdateOrderForm(booking) {
  const formHtml = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>Update food order for room ${booking.room_number}</h3>
        <label>Food Orders<textarea id="food_order">${booking.food_order || ''}</textarea></label>
        <label>Serve Time<input id="serve_time" type="time" value="${booking.serve_time || ''}" /></label>
        <div class="modal-actions">
          <button id="cancel-update" class="secondary">Cancel</button>
          <button id="confirm-update">Confirm</button>
        </div>
      </div>
    </div>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = formHtml;
  document.body.appendChild(wrapper);
  wrapper.querySelector('#cancel-update').addEventListener('click', () => wrapper.remove());
  wrapper.querySelector('#confirm-update').addEventListener('click', async () => {
    const food_order = wrapper.querySelector('#food_order').value.trim();
    const serve_time = wrapper.querySelector('#serve_time').value;
    if (!food_order) return alert('Food order is required.');
    await api('/rooms/update-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: booking.id, food_order, serve_time })
    });
    wrapper.remove();
    renderPanel('rooms');
  });
}

function openOrderDetail(order) {
  const formHtml = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>Food order for room ${order.room_number}</h3>
        <p><strong>Order:</strong> ${order.food_order}</p>
        <p><strong>Serve time:</strong> ${order.serve_time || 'Not set'}</p>
        <div class="modal-actions">
          <button id="close-order" class="secondary">Close</button>
        </div>
      </div>
    </div>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = formHtml;
  document.body.appendChild(wrapper);
  wrapper.querySelector('#close-order').addEventListener('click', () => wrapper.remove());
}

async function renderBilling() {
  panels.billing.innerHTML = '<h2>Billing</h2>';
  const response = await api('/billing/occupied');
  if (response.bookings.length === 0) {
    panels.billing.innerHTML += '<p>No occupied rooms available for checkout.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'card-list';
  response.bookings.forEach((booking) => {
    const item = document.createElement('div');
    item.className = 'card billing-card';
    const foodAmount = booking.food_order ? 150 : 0;
    const total = booking.rate + foodAmount;
    item.innerHTML = `<strong>Room ${booking.room_number}</strong><span>Guest: ${booking.guest_name}</span><span>Room rate: ₱${booking.rate}</span><span>Food: ₱${foodAmount}</span><span>Total: ₱${total}</span>`;
    const button = document.createElement('button');
    button.textContent = 'Checkout';
    button.addEventListener('click', async () => {
      if (!confirm(`Confirm checkout for room ${booking.room_number}?`)) return;
      await api('/billing/checkout', { method: 'POST', body: JSON.stringify({ bookingId: booking.id }) });
      renderPanel('billing');
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  panels.billing.appendChild(list);
}

async function renderOrders() {
  panels.orders.innerHTML = '<h2>Food & Beverage Orders</h2>';
  const response = await api('/orders');
  if (response.orders.length === 0) {
    panels.orders.innerHTML += '<p>No food orders in the queue.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'card-list';
  response.orders.forEach((order) => {
    const item = document.createElement('div');
    item.className = 'card order-card';
    item.innerHTML = `<strong>Room ${order.room_number}</strong><span>Guest: ${order.guest_name || 'N/A'}</span><span>Order: ${order.food_order}</span><span>Serve by: ${order.serve_time || 'N/A'}</span><span>Status: ${order.status}</span>`;
    const button = document.createElement('button');
    button.textContent = order.status === 'delivered' ? 'Delivered' : 'Mark Delivered';
    button.disabled = order.status === 'delivered';
    button.addEventListener('click', async () => {
      await api('/orders/deliver', { method: 'POST', body: JSON.stringify({ orderId: order.id }) });
      renderPanel('orders');
    });
    item.appendChild(button);
    if (order.updated) {
      const badge = document.createElement('span');
      badge.className = 'badge success';
      badge.textContent = 'updated';
      item.appendChild(badge);
    }
    list.appendChild(item);
  });
  panels.orders.appendChild(list);
}

async function renderReceipts() {
  panels.receipts.innerHTML = '<h2>Receipts</h2>';
  const response = await api('/receipts');
  if (response.receipts.length === 0) {
    panels.receipts.innerHTML += '<p>No receipts generated yet.</p>';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Room</th><th>Guest</th><th>Room</th><th>Food</th><th>Total</th><th>Date</th></tr></thead>';
  const body = document.createElement('tbody');
  response.receipts.forEach((receipt) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${receipt.room_number}</td><td>${receipt.guest_name}</td><td>₱${receipt.room_rate}</td><td>₱${receipt.food_amount}</td><td>₱${receipt.total}</td><td>${receipt.created_at}</td>`;
    body.appendChild(row);
  });
  table.appendChild(body);
  panels.receipts.appendChild(table);
}

async function renderLedger() {
  panels.ledger.innerHTML = '<h2>Ledger</h2>';
  const response = await api('/ledger');
  if (response.ledger.length === 0) {
    panels.ledger.innerHTML += '<p>No ledger entries yet.</p>';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Description</th><th>Amount</th><th>Type</th><th>Date</th></tr></thead>';
  const body = document.createElement('tbody');
  response.ledger.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${entry.description}</td><td>₱${entry.amount}</td><td>${entry.type}</td><td>${entry.created_at}</td>`;
    body.appendChild(row);
  });
  table.appendChild(body);
  panels.ledger.appendChild(table);
}

async function renderHousekeeping() {
  panels.housekeeping.innerHTML = '<h2>Housekeeping</h2>';
  const response = await api('/housekeeping/tasks');
  if (response.tasks.length === 0) {
    panels.housekeeping.innerHTML += '<p>No housekeeping tasks yet.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'card-list';
  response.tasks.forEach((task) => {
    const item = document.createElement('div');
    item.className = 'card task-card';
    item.innerHTML = `<strong>Room ${task.room_number}</strong><span>Status: ${task.status}</span>`;
    const button = document.createElement('button');
    button.textContent = task.status === 'ready' ? 'Ready' : 'Mark Ready';
    button.disabled = task.status === 'ready';
    button.addEventListener('click', async () => {
      await api('/housekeeping/ready', { method: 'POST', body: JSON.stringify({ taskId: task.id }) });
      renderPanel('housekeeping');
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  panels.housekeeping.appendChild(list);
}

async function renderPanel(panelKey) {
  if (panelKey === 'dashboard') {
    const { stats } = await api('/dashboard');
    renderDashboard(stats);
  } else if (panelKey === 'rooms') {
    await renderRooms();
  } else if (panelKey === 'billing') {
    await renderBilling();
  } else if (panelKey === 'orders') {
    await renderOrders();
  } else if (panelKey === 'receipts') {
    await renderReceipts();
  } else if (panelKey === 'ledger') {
    await renderLedger();
  } else if (panelKey === 'housekeeping') {
    await renderHousekeeping();
  }
}

function buildNavigation() {
  const role = session.user.role;
  const navItems = [{ title: 'Home', panel: 'dashboard' }];
  if (role === 'admin') {
    navItems.push({ title: 'Rooms', panel: 'rooms' }, { title: 'Billing', panel: 'billing' });
  } else if (role === 'food-beverage') {
    navItems.push({ title: 'Orders', panel: 'orders' });
  } else if (role === 'accounting') {
    navItems.push({ title: 'Receipts', panel: 'receipts' }, { title: 'Ledger', panel: 'ledger' });
  } else if (role === 'housekeeping') {
    navItems.push({ title: 'Housekeeping', panel: 'housekeeping' });
  }
  setNav(navItems);
  roleLabel.textContent = `${session.user.name} (${session.user.department})`;
}

async function initializeApp() {
  loadSession();
  if (!session.token || !session.user) {
    showView('login');
    return;
  }
  try {
    await api('/user');
    showView('app');
    buildNavigation();
    showPanel('dashboard');
    renderPanel('dashboard');
  } catch (err) {
    clearSession();
    showView('login');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  try {
    const response = await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveSession(response.token, response.user);
    buildNavigation();
    showView('app');
    showPanel('dashboard');
    renderPanel('dashboard');
  } catch (err) {
    loginError.textContent = err.message;
  }
});

logoutButton.addEventListener('click', () => {
  clearSession();
  showView('login');
});

initializeApp();
