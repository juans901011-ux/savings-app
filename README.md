# Savings App 💰

Plataforma de ahorro para comunidad de traders e inversores.

## Stack

- HTML + Tailwind CSS (CDN)
- JavaScript vanilla
- Supabase (Auth + PostgreSQL + RLS)
- Deploy en Netlify

## Setup local

1. Clonar el repo
2. Copiar `js/config.template.js` a `js/config.js`
3. Rellenar `js/config.js` con las claves de tu proyecto Supabase
4. Abrir `index.html` con Live Server (VS Code)

## Estructura

- `index.html` — Landing / test de conexión
- `register.html` — Registro de usuarios
- `login.html` — Inicio de sesión
- `dashboard.html` — Panel del usuario (registrar ahorros)
- `admin.html` — Panel admin (estadísticas de la comunidad)
- `sql/schema.sql` — Esquema completo de la DB
- `js/` — Lógica de la app