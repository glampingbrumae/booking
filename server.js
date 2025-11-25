// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG GENERAL ===
app.use(cors());
app.use(bodyParser.json());

// === AUTH CONFIG (login admin) ===
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'brumae123';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'brumae_admin_token_123';

// helper para leer cookies
function getCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

// middleware para proteger rutas admin
function requireAdmin(req, res, next) {
  const cookies = getCookies(req);
  if (cookies.admin_auth === ADMIN_TOKEN) {
    return next();
  }
  // Si es HTML, mejor redirigir al login
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.redirect('/admin-login.html');
  }
  // Para API: 401 JSON
  return res.status(401).json({ error: 'No autorizado. Inicia sesión como administrador.' });
}

// === DB SQLITE ===
const db = new sqlite3.Database('./brumae_db.sqlite', (err) => {
  if (err) console.error(err.message);
  console.log('✅ Conectado a SQLite brumae_db.sqlite');
});

db.run(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name        TEXT NOT NULL,
    client_email       TEXT,
    client_phone       TEXT NOT NULL,
    check_in           TEXT NOT NULL,   -- YYYY-MM-DD
    check_out          TEXT NOT NULL,   -- YYYY-MM-DD
    guests             INTEGER,
    extra_person       INTEGER DEFAULT 0, -- 0 o 1 (persona adicional)
    decoration         INTEGER DEFAULT 0, -- 0 o 1 (decoración especial)
    decoration_reason  TEXT,
    cabins             INTEGER DEFAULT 1, -- siempre 1 cabaña
    extras             TEXT,
    total_price        INTEGER,
    status             TEXT DEFAULT 'PENDIENTE', -- PENDIENTE, CONFIRMADA, CANCELADA
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error('Error creando tabla bookings:', err.message);
});

// === MAIL (Nodemailer) ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// === PARÁMETROS BRUMAE ===
const WEEKDAY_RATE = 320000;     // noches entre semana
const WEEKEND_RATE = 395000;     // noches fin de semana / festivos
const EXTRA_PERSON_RATE = 90000; // persona extra por noche
const DECORATION_RATE = 50000;   // decoración especial por estadía
const ADMIN_WHATSAPP = '573123228719';
const MAX_CABINS = 2; // máximo 2 cabañas ocupadas por noche

// Helpers de fecha
function parseDateISO(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

function getDatesBetween(checkInStr, checkOutStr) {
  const dates = [];
  const start = parseDateISO(checkInStr);
  const end = parseDateISO(checkOutStr);

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

function isWeekend(date) {
  // 0 dom, 1 lun, 2 mar, 3 mie, 4 jue, 5 vie, 6 sab
  const day = date.getDay();
  // noche alta si el día de check-in es viernes o sábado
  return day === 5 || day === 6;
}

// Festivos (día de descanso) en formato YYYY-MM-DD
const HOLIDAYS = [
  '2025-12-08',
  '2025-12-25',
  '2026-01-01',
  '2026-01-12',
  '2026-03-23',
  '2026-04-02',
  '2026-04-03',
  '2026-05-01',
  '2026-05-18',
  '2026-06-08',
  '2026-06-15',
  '2026-06-29',
  '2026-07-20',
  '2026-08-07',
  '2026-08-17',
  '2026-10-12',
  '2026-11-02',
  '2026-11-16',
  '2026-12-08',
  '2026-12-25',
  '2027-01-01',
  '2027-01-11',
  '2027-03-22',
  '2027-03-25',
  '2027-03-26',
  '2027-05-01',
  '2027-05-10',
  '2027-05-31',
  '2027-06-07',
  '2027-07-05',
  '2027-07-20',
  '2027-08-07',
  '2027-08-16',
  '2027-10-18',
  '2027-11-01',
  '2027-11-15',
  '2027-12-08',
  '2027-12-25'
];

function isHoliday(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;
  return HOLIDAYS.includes(iso);
}

/**
 * Calcula el precio total entre dos fechas (check_in, check_out),
 * considerando:
 * - noches viernes→sábado y sábado→domingo como tarifa alta
 * - noche previa a un festivo (día siguiente festivo) como tarifa alta
 * - persona extra por noche
 * - decoración especial por estadía
 */
function calculateTotalPrice(checkInStr, checkOutStr, hasExtraPerson, hasDecoration) {
  const nights = getDatesBetween(checkInStr, checkOutStr);
  let total = 0;

  nights.forEach((dayStr) => {
    const d = parseDateISO(dayStr); // día de check-in de la noche
    const next = new Date(d);
    next.setDate(next.getDate() + 1); // día siguiente (para festivo)

    const isHighRate = isWeekend(d) || isHoliday(next);
    const base = isHighRate ? WEEKEND_RATE : WEEKDAY_RATE;

    total += base;
    if (hasExtraPerson) {
      total += EXTRA_PERSON_RATE;
    }
  });

  if (hasDecoration) {
    total += DECORATION_RATE;
  }

  return total;
}

// Disponibilidad por rango
function checkAvailability(checkIn, checkOut, cabinsRequested, callback) {
  const query = `
    SELECT * FROM bookings
    WHERE status != 'CANCELADA'
      AND NOT (date(check_out) <= date(?) OR date(check_in) >= date(?))
  `;
  db.all(query, [checkIn, checkOut], (err, rows) => {
    if (err) return callback(err);

    const calendar = {};

    rows.forEach((booking) => {
      const days = getDatesBetween(booking.check_in, booking.check_out);
      days.forEach((day) => {
        if (!calendar[day]) calendar[day] = 0;
        calendar[day] += booking.cabins || 1;
      });
    });

    const requestedDays = getDatesBetween(checkIn, checkOut);
    for (const day of requestedDays) {
      const bookedCabins = calendar[day] || 0;
      if (bookedCabins + cabinsRequested > MAX_CABINS) {
        return callback(null, {
          available: false,
          conflictDate: day,
          bookedCabins,
          maxCabins: MAX_CABINS
        });
      }
    }

    callback(null, { available: true });
  });
}

// Mail al cliente
function sendClientEmail(booking) {
  if (!booking.client_email) return;

  const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });
  const totalFormatted = formatter.format(booking.total_price || 0);
  const noches = getDatesBetween(booking.check_in, booking.check_out).length;
  const personas = booking.guests || (booking.extra_person ? 3 : 2);

  const decoText = booking.decoration
    ? (booking.decoration_reason ? `Sí (${booking.decoration_reason})` : 'Sí')
    : 'No';

  const mailOptions = {
    from: process.env.MAIL_USER,
    to: booking.client_email,
    subject: 'Reserva en Glamping Brumae - Recibida',
    text: `
Hola ${booking.client_name} 🌿

Hemos recibido tu solicitud de reserva en Glamping Brumae.

Detalle de la reserva:
- Nombre: ${booking.client_name}
- Teléfono: ${booking.client_phone}
- Fechas: ${booking.check_in} al ${booking.check_out} (${noches} noche(s))
- Personas: ${personas}
- Decoración especial: ${decoText}
- Total estimado: ${totalFormatted}
- Comentarios: ${booking.extras || ''}

En breve te contactaremos para confirmar la disponibilidad final y compartir los datos para el anticipo (50%).

Atentamente,
Glamping Brumae
    `.trim()
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('❌ Error enviando correo al cliente:', err);
    } else {
      console.log('📧 Correo enviado al cliente:', info.response);
    }
  });
}

// === ENDPOINT LOGIN ADMIN ===
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // cookie por 4 horas
    const maxAge = 60 * 60 * 4;
    res.setHeader(
      'Set-Cookie',
      `admin_auth=${encodeURIComponent(ADMIN_TOKEN)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`
    );
    return res.json({ message: 'Login correcto' });
  }
  return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
});

// logout opcional
app.post('/admin/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    'admin_auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
  );
  res.json({ message: 'Sesión cerrada.' });
});

// === ENDPOINT: crear reserva (público) ===
app.post('/api/bookings', (req, res) => {
  const {
    client_name,
    client_email,
    client_phone,
    check_in,
    check_out,
    extra_person,
    decoration,
    decoration_reason
  } = req.body;

  if (!client_name || !client_phone || !check_in || !check_out) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  // al menos 1 noche
  const nights = getDatesBetween(check_in, check_out).length;
  if (nights <= 0) {
    return res.status(400).json({ error: 'El rango de fechas debe ser mínimo de 1 noche.' });
  }

  const hasExtraPerson = !!extra_person;
  const hasDecoration = !!decoration;
  const guests = hasExtraPerson ? 3 : 2;
  const cabinsRequested = 1; // siempre 1 cabaña

  // 1. verificar disponibilidad
  checkAvailability(check_in, check_out, cabinsRequested, (err, result) => {
    if (err) {
      console.error('Error verificando disponibilidad:', err);
      return res.status(500).json({ error: 'Error interno verificando disponibilidad.' });
    }

    if (!result.available) {
      return res.status(409).json({
        error: 'No hay disponibilidad en alguna de las noches.',
        conflictDate: result.conflictDate,
        bookedCabins: result.bookedCabins,
        maxCabins: result.maxCabins
      });
    }

    // 2. calcular precio
    const total_price = calculateTotalPrice(check_in, check_out, hasExtraPerson, hasDecoration);

    // 3. insertar en DB
    const insertQuery = `
      INSERT INTO bookings (
        client_name, client_email, client_phone,
        check_in, check_out, guests, extra_person,
        decoration, decoration_reason,
        cabins, extras, total_price, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
    `;
    const params = [
      client_name,
      client_email || null,
      client_phone,
      check_in,
      check_out,
      guests,
      hasExtraPerson ? 1 : 0,
      hasDecoration ? 1 : 0,
      decoration_reason || null,
      cabinsRequested,
      req.body.extras || null,
      total_price
    ];

    db.run(insertQuery, params, function (err) {
      if (err) {
        console.error('Error insertando reserva:', err);
        return res.status(500).json({ error: 'Error guardando la reserva.' });
      }

      const newBooking = {
        id: this.lastID,
        client_name,
        client_email,
        client_phone,
        check_in,
        check_out,
        guests,
        extra_person: hasExtraPerson ? 1 : 0,
        decoration: hasDecoration ? 1 : 0,
        decoration_reason: decoration_reason || null,
        cabins: cabinsRequested,
        extras: req.body.extras || null,
        total_price,
        status: 'PENDIENTE'
      };

      // mail al cliente
      sendClientEmail(newBooking);

      res.json({
        message: 'Reserva registrada correctamente. Pendiente de confirmación.',
        booking: newBooking
      });
    });
  });
});

// === ENDPOINT: lista para admin (protegido) ===
app.get('/api/bookings', requireAdmin, (req, res) => {
  db.all(
    `SELECT * FROM bookings ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error('Error consultando reservas:', err);
        return res.status(500).json({ error: 'Error obteniendo reservas.' });
      }
      res.json(rows);
    }
  );
});

// === ENDPOINT: actualizar estado (protegido) ===
app.patch('/api/bookings/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  db.run(
    `UPDATE bookings SET status = ? WHERE id = ?`,
    [status, id],
    function (err) {
      if (err) {
        console.error('Error actualizando estado:', err);
        return res.status(500).json({ error: 'Error actualizando estado.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Reserva no encontrada.' });
      }
      res.json({ message: 'Estado actualizado correctamente.' });
    }
  );
});

// === ENDPOINT: eliminar reserva (protegido) ===
app.delete('/api/bookings/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run(
    `DELETE FROM bookings WHERE id = ?`,
    [id],
    function (err) {
      if (err) {
        console.error('Error eliminando reserva:', err);
        return res.status(500).json({ error: 'Error eliminando reserva.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Reserva no encontrada.' });
      }
      res.json({ message: 'Reserva eliminada correctamente.' });
    }
  );
});

// === ENDPOINT: disponibilidad rápida (público) ===
app.get('/api/availability', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Parámetros from y to son obligatorios.' });
  }

  checkAvailability(from, to, 1, (err, result) => {
    if (err) {
      console.error('Error verificando disponibilidad:', err);
      return res.status(500).json({ error: 'Error interno.' });
    }
    res.json(result);
  });
});

// === ENDPOINT: días completamente reservados (2 cabañas confirmadas) ===
app.get('/api/fully-booked-dates', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Parámetros from y to son obligatorios (YYYY-MM-DD).' });
  }

  const query = `
    SELECT check_in, check_out, cabins
    FROM bookings
    WHERE status = 'CONFIRMADA'
      AND NOT (date(check_out) <= date(?) OR date(check_in) >= date(?))
  `;

  db.all(query, [from, to], (err, rows) => {
    if (err) {
      console.error('Error consultando fechas completas:', err);
      return res.status(500).json({ error: 'Error interno obteniendo fechas.' });
    }

    const calendar = {};

    rows.forEach((booking) => {
      const cabins = booking.cabins || 1;
      const days = getDatesBetween(booking.check_in, booking.check_out);
      days.forEach((day) => {
        if (!calendar[day]) calendar[day] = 0;
        calendar[day] += cabins;
      });
    });

    // Días donde se alcanzó o superó la capacidad total
    const fullyBooked = Object.entries(calendar)
      .filter(([_, count]) => count >= MAX_CABINS)
      .map(([day]) => day);

    res.json({ fullyBooked });
  });
});

// === RUTA PROTEGIDA PARA ADMIN.HTML ===
app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === STATIC (páginas públicas y login) ===
app.use(express.static(path.join(__dirname, 'public')));

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`🚀 Servidor Brumae en http://localhost:${PORT}`);
});
