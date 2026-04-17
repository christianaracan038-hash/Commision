# Hotel Management System

A simple web-based Hotel Management System with role-based access for Admin/Front Desk, Food & Beverage, Accounting, and Housekeeping.

## Features

- Login with email/password and role-based dashboard routing
- Admin / Front Desk:
  - Home dashboard overview
  - Available rooms, occupied rooms, rooms with food orders
  - Guest check-in, food order updates, checkout and receipt generation
- Food & Beverage:
  - Food order queue
  - Mark orders as delivered
- Accounting:
  - View receipts
  - View transaction ledger
- Housekeeping:
  - View checkout cleaning tasks
  - Mark rooms ready for the next guest

## Run locally

1. Open a terminal in the project folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open http://localhost:3000 in the browser.

## Demo credentials

- admin@hotel.com / password
- food@hotel.com / password
- accounting@hotel.com / password
- housekeeping@hotel.com / password

## Notes

- Data is stored in `hotel.db` using SQLite.
- Real-time updates are supported through the backend data model and refreshed views.
- This implementation is a proof of concept with centralized data sharing across departments.
