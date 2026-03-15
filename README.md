# Ouroboros

A journaling app where time is rendered as a 3D spiral and entries are colored beads on that spiral.

## Stack

- **Frontend:** Vanilla JS + Three.js (bundled with Vite)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL

## Setup

1. Copy `backend/.env.example` to `backend/.env` and fill in your values
2. `cd backend && npm install`
3. `cd frontend && npm install`
4. `cd backend && npm run dev`
5. `cd frontend && npm run dev`

Backend runs on port 3001, frontend dev server on port 5173.

## Demo Account

Seed the demo account: `cd backend && node src/db/seedDemo.js`

- **Email:** demo@ouroboros.app
- **Password:** demo1234
