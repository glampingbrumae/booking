// admin.js

const body = document.getElementById('bookingsBody');
const refreshBtn = document.getElementById('refreshBtn');
const filterStatus = document.getElementById('filterStatus');
const filterFrom = document.getElementById('filterFrom');
const filterTo = document.getElementById('filterTo');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const logoutBtn = document.getElementById('logoutBtn');


let allBookings = [];

function formatCOP(value) {
  if (value == null) return '';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value);
}

function diffNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const d1 = new Date(checkIn + 'T00:00:00');
  const d2 = new Date(checkOut + 'T00:00:00');
  const ms = d2 - d1;
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24);
}

function applyFilters() {
  let filtered = [...allBookings];

  const status = filterStatus.value;
  if (status !== 'TODOS') {
    filtered = filtered.filter(b => b.status === status);
  }

  const from = filterFrom.value;
  const to = filterTo.value;
  if (from) {
    filtered = filtered.filter(b => b.check_in >= from);
  }
  if (to) {
    filtered = filtered.filter(b => b.check_out <= to);
  }

  renderTable(filtered);
}

function buildWhatsAppLink(booking) {
  const rawPhone = booking.client_phone || '';
  const phoneDigits = rawPhone.replace(/\D/g, ''); // solo números

  if (!phoneDigits) return null;

  const noches = diffNights(booking.check_in, booking.check_out);
  const personas = booking.guests || (booking.extra_person ? 3 : 2);
  const totalFormatted = formatCOP(booking.total_price);
  const decoText = booking.decoration
    ? (booking.decoration_reason ? `Sí (${booking.decoration_reason})` : 'Sí')
    : 'No';

  const text =
    `Hola ${booking.client_name}, te escribimos de Glamping Brumae ` +
    `sobre tu reserva del ${booking.check_in} al ${booking.check_out} ` +
    `(${noches} noche(s)) para ${personas} persona(s). ` +
    `Decoración especial: ${decoText}. ` +
    `Total estimado: ${totalFormatted}. ` +
    `Si deseas confirmar, por favor indícanos y te compartimos los datos para el anticipo (50%).`;

  const url =
    `https://api.whatsapp.com/send/?phone=${phoneDigits}` +
    `&text=${encodeURIComponent(text)}` +
    `&type=phone_number&app_absent=0`;

  return url;
}

function renderTable(bookings) {
  body.innerHTML = '';

  if (!bookings || bookings.length === 0) {
    body.innerHTML = '<tr><td colspan="12">No hay reservas para los filtros seleccionados.</td></tr>';
    return;
  }

  bookings.forEach((b) => {
    const tr = document.createElement('tr');

    const noches = diffNights(b.check_in, b.check_out);
    const personas = b.guests || (b.extra_person ? 3 : 2);
    const extraLabel = b.extra_person ? 'Sí (+1 persona)' : 'No';

    const decoLabel = b.decoration
      ? (b.decoration_reason ? `Sí (${b.decoration_reason})` : 'Sí')
      : 'No';

    const totalFormatted = formatCOP(b.total_price);

    const contacto =
      `${b.client_phone || ''}` +
      (b.client_email ? `<br><span class="text-muted">${b.client_email}</span>` : '');

    const fechas =
      `${b.check_in} → ${b.check_out}<br>` +
      `<span class="text-muted">${noches} noche(s)</span>`;

    const waUrl = buildWhatsAppLink(b);
    const waButton = waUrl
      ? `<a href="${waUrl}" target="_blank" class="wa-link">Chat</a>`
      : `<span class="wa-link disabled">Sin WhatsApp</span>`;

    tr.innerHTML = `
      <td>${b.id}</td>
      <td>${b.client_name}</td>
      <td>${contacto}</td>
      <td>${fechas}</td>
      <td>${personas}</td>
      <td>${extraLabel}</td>
      <td>${decoLabel}</td>
      <td>${totalFormatted}</td>
      <td>${waButton}</td>
      <td><span class="status-badge ${b.status}">${b.status}</span></td>
      <td>
        <select data-id="${b.id}" class="status-select">
          <option value="PENDIENTE" ${b.status === 'PENDIENTE' ? 'selected' : ''}>Pendiente</option>
          <option value="CONFIRMADA" ${b.status === 'CONFIRMADA' ? 'selected' : ''}>Confirmada</option>
          <option value="CANCELADA" ${b.status === 'CANCELADA' ? 'selected' : ''}>Cancelada</option>
        </select>
      </td>
      <td>
        <button class="btn btn-delete" data-id="${b.id}">X</button>
      </td>
    `;

    body.appendChild(tr);
  });

  // listeners estado
  document.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const id = e.target.getAttribute('data-id');
      const status = e.target.value;
      await updateStatus(id, status);
      await loadBookings(false); // recarga pero respeta filtros
    });
  });

  // listeners eliminar
  document.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm(`¿Eliminar la reserva ${id}?`)) {
        await deleteBooking(id);
        await loadBookings(false);
      }
    });
  });
}

async function loadBookings(resetFilters = true) {
  body.innerHTML = '<tr><td colspan="12">Cargando...</td></tr>';
  refreshBtn.disabled = true;

  try {
    const res = await fetch('/api/bookings');
    const data = await res.json();
    allBookings = Array.isArray(data) ? data : [];

    if (resetFilters) {
      filterStatus.value = 'TODOS';
      filterFrom.value = '';
      filterTo.value = '';
    }

    applyFilters();
  } catch (err) {
    console.error(err);
    body.innerHTML = '<tr><td colspan="12">Error cargando reservas.</td></tr>';
  } finally {
    refreshBtn.disabled = false;
  }
}

async function updateStatus(id, status) {
  try {
    await fetch(`/api/bookings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
  } catch (err) {
    console.error('Error actualizando estado', err);
  }
}

async function deleteBooking(id) {
  try {
    await fetch(`/api/bookings/${id}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Error eliminando reserva', err);
  }
}

logoutBtn.addEventListener('click', async () => {
  if (!confirm("¿Deseas cerrar la sesión de administrador?")) return;

  try {
    await fetch('/admin/logout', {
      method: 'POST'
    });

    // redirigir al login
    window.location.href = '/admin-login.html';
  } catch (err) {
    console.error("Error cerrando sesión:", err);
    alert("No se pudo cerrar la sesión, intenta nuevamente.");
  }
});


refreshBtn.addEventListener('click', () => loadBookings(true));
applyFiltersBtn.addEventListener('click', applyFilters);

loadBookings(true);
