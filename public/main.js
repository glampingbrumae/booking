// main.js

// ====== PARÁMETROS DE PRECIOS (solo para mostrar resumen en frontend) ======
const WEEKDAY_RATE = 320000;      // noches entre semana
const WEEKEND_RATE = 395000;      // noches viernes/sábado y víspera festivo
const EXTRA_PERSON_RATE = 90000;  // por noche
const DECORATION_RATE = 50000;    // por estadía
const ADMIN_WHATSAPP = '573123228719';

// Festivos de ejemplo, debe coincidir (idealmente) con el backend
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

// ====== VARIABLES GLOBALES DE CALENDARIO ======
let selectedStartDate = null;
let selectedEndDate = null;
let fullyBookedDates = new Set(); // 'YYYY-MM-DD' para fechas con 2 cabañas confirmadas
let currentMonth;                 // Date con día 1 del mes actual
let dateRangePickerEl;
let summaryBoxEl;
let extraPersonChk;
let decorationChk;
let decorationReasonSel;
let decorationReasonCustomInput;
let decorationReasonGroup;
let decorationReasonCustomGroup;
let formMessageEl;

// ====== HELPERS DE FECHA Y FORMATO ======
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDatesBetweenDates(start, end) {
  // devuelve array de Date: [start, start+1, ..., end-1]
  const dates = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d < endDate) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function isWeekend(date) {
  const day = date.getDay(); // 0 dom, 1 lun, ..., 5 vie, 6 sab
  return day === 5 || day === 6; // viernes o sábado
}

function isHoliday(date) {
  const iso = toISODate(date);
  return HOLIDAYS.includes(iso);
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Calcula precio estimado en frontend (para resumen):
 * - Tarifa alta si el día de check-in es viernes/sábado o si el día siguiente es festivo.
 * - Persona extra por noche.
 * - Decoración por estadía.
 */
function calculatePrice(start, end, hasExtra, hasDecoration) {
  if (!start || !end || end <= start) {
    return { nights: 0, total: 0 };
  }

  const nights = getDatesBetweenDates(start, end);
  let total = 0;

  nights.forEach((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);

    const isHighRate = isWeekend(d) || isHoliday(next);
    const base = isHighRate ? WEEKEND_RATE : WEEKDAY_RATE;

    total += base;
    if (hasExtra) total += EXTRA_PERSON_RATE;
  });

  if (hasDecoration) {
    total += DECORATION_RATE;
  }

  return { nights: nights.length, total };
}

// ====== CALENDARIO ======

function renderCalendar(monthDate) {
  if (!dateRangePickerEl) return;

  dateRangePickerEl.innerHTML = '';

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth(); // 0-11

  const header = document.createElement('div');
  header.className = 'calendar-header';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.textContent = '‹';
  prevBtn.className = 'calendar-nav';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = '›';
  nextBtn.className = 'calendar-nav';

  const title = document.createElement('div');
  title.className = 'calendar-month';
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  title.textContent = `${monthNames[month]} ${year}`;

  header.appendChild(prevBtn);
  header.appendChild(title);
  header.appendChild(nextBtn);
  dateRangePickerEl.appendChild(header);

  // Fila de días de la semana
  const weekdaysRow = document.createElement('div');
  weekdaysRow.className = 'calendar-weekdays';
  const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  weekdays.forEach((w) => {
    const cell = document.createElement('div');
    cell.textContent = w;
    weekdaysRow.appendChild(cell);
  });
  dateRangePickerEl.appendChild(weekdaysRow);

  // Grid de días
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  let startWeekDay = firstDay.getDay(); // 0 dom, 1 lun, ...

  // Queremos que la semana inicie en Lunes
  if (startWeekDay === 0) {
    startWeekDay = 7;
  }

  // Huecos antes del día 1
  for (let i = 1; i < startWeekDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-cell empty';
    grid.appendChild(emptyCell);
  }

  const todayIso = toISODate(new Date());

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const iso = toISODate(date);

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.textContent = day;
    cell.className = 'calendar-day';

    if (iso === todayIso) {
      cell.classList.add('today');
    }

    // Fecha completamente reservada => deshabilitada
    if (fullyBookedDates.has(iso)) {
      cell.classList.add('date-disabled');
      cell.disabled = true;
    } else {
      cell.addEventListener('click', () => onDayClick(date));
    }

    // Marcar rango seleccionado
    if (selectedStartDate) {
      const startIso = toISODate(selectedStartDate);
      if (iso === startIso) {
        cell.classList.add('selected', 'start');
      }
    }
    if (selectedEndDate) {
      const endIso = toISODate(selectedEndDate);
      if (iso === endIso) {
        cell.classList.add('selected', 'end');
      }

      if (selectedStartDate && selectedEndDate && date > selectedStartDate && date < selectedEndDate) {
        cell.classList.add('in-range');
      }
    }

    grid.appendChild(cell);
  }

  dateRangePickerEl.appendChild(grid);

  // Navegación de mes
  prevBtn.addEventListener('click', () => {
    currentMonth = new Date(year, month - 1, 1);
    renderCalendar(currentMonth);
  });

  nextBtn.addEventListener('click', () => {
    currentMonth = new Date(year, month + 1, 1);
    renderCalendar(currentMonth);
  });
}

function onDayClick(date) {
  // Si no hay inicio o ya había un rango completo, reiniciamos
  if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
    selectedStartDate = date;
    selectedEndDate = null;
  } else {
    // Si la nueva fecha es menor o igual al inicio, reiniciamos desde ahí
    if (date <= selectedStartDate) {
      selectedStartDate = date;
      selectedEndDate = null;
    } else {
      selectedEndDate = date;
    }
  }

  // Actualizar inputs ocultos
  const checkInInput = document.getElementById('check_in');
  const checkOutInput = document.getElementById('check_out');

  if (selectedStartDate) {
    checkInInput.value = toISODate(selectedStartDate);
  } else {
    checkInInput.value = '';
  }

  if (selectedEndDate) {
    checkOutInput.value = toISODate(selectedEndDate);
  } else {
    checkOutInput.value = '';
  }

  renderCalendar(currentMonth);
  updateSummary();
}

function updateSummary() {
  if (!summaryBoxEl) return;

  if (!selectedStartDate || !selectedEndDate || selectedEndDate <= selectedStartDate) {
    summaryBoxEl.style.display = 'none';
    summaryBoxEl.innerHTML = '';
    return;
  }

  const hasExtra = !!extraPersonChk?.checked;
  const hasDecoration = !!decorationChk?.checked;

  const { nights, total } = calculatePrice(selectedStartDate, selectedEndDate, hasExtra, hasDecoration);

  if (nights <= 0) {
    summaryBoxEl.style.display = 'none';
    summaryBoxEl.innerHTML = '';
    return;
  }

  const checkInStr = toISODate(selectedStartDate);
  const checkOutStr = toISODate(selectedEndDate);

  const extraText = hasExtra ? 'Sí (+1 persona)' : 'No';
  const decoText = hasDecoration ? 'Sí (decoración especial)' : 'No';

  summaryBoxEl.style.display = 'block';
  summaryBoxEl.innerHTML = `
    <strong>Resumen de tu reserva:</strong><br>
    Fechas: ${checkInStr} al ${checkOutStr}<br>
    Noches: ${nights}<br>
    Persona extra: ${extraText}<br>
    Decoración especial: ${decoText}<br>
    <strong>Total estimado:</strong> ${formatCOP(total)}
  `;
}

// Carga fechas con 2 cabañas confirmadas desde el backend
async function loadFullyBookedDates() {
  try {
    const today = new Date();
    const future = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
    const from = toISODate(today);
    const to = toISODate(future);

    const res = await fetch(`/api/fully-booked-dates?from=${from}&to=${to}`);
    const data = await res.json();

    fullyBookedDates = new Set(data.fullyBooked || []);

    // Volver a pintar calendario para aplicar estilos de fechas bloqueadas
    renderCalendar(currentMonth);
  } catch (err) {
    console.error('Error cargando fechas completas:', err);
  }
}

// ====== FORMULARIO Y WHATSAPP ======

async function handleSubmit(event) {
  event.preventDefault();
  if (!formMessageEl) return;

  formMessageEl.textContent = '';
  formMessageEl.className = 'result-message';

  const checkInInput = document.getElementById('check_in');
  const checkOutInput = document.getElementById('check_out');
  const clientNameInput = document.getElementById('client_name');
  const clientPhoneInput = document.getElementById('client_phone');
  const clientEmailInput = document.getElementById('client_email');
  const extrasInput = document.getElementById('extras');

  const check_in = checkInInput.value;
  const check_out = checkOutInput.value;
  const client_name = clientNameInput.value.trim();
  const client_phone = clientPhoneInput.value.trim();
  const client_email = clientEmailInput.value.trim() || null;
  const extras = extrasInput.value.trim() || null;

  const extra_person = extraPersonChk.checked ? 1 : 0;
  const decoration = decorationChk.checked ? 1 : 0;

  // Motivo decoración
  let decoReason = '';
  if (decoration) {
    const sel = decorationReasonSel.value;
    if (sel === 'Otra') {
      decoReason = decorationReasonCustomInput.value.trim();
    } else {
      decoReason = sel;
    }
  }

  if (!client_name || !client_phone || !check_in || !check_out) {
    formMessageEl.textContent = 'Por favor completa tu nombre, WhatsApp y selecciona un rango de fechas válido.';
    formMessageEl.classList.add('error');
    return;
  }

  // Validar rango (al menos 1 noche)
  const s = new Date(check_in + 'T00:00:00');
  const e = new Date(check_out + 'T00:00:00');
  if (!(s < e)) {
    formMessageEl.textContent = 'El rango de fechas debe ser mínimo de 1 noche.';
    formMessageEl.classList.add('error');
    return;
  }

  // Estimación para mensaje de WhatsApp (en frontend)
  const hasExtra = !!extra_person;
  const hasDecoration = !!decoration;
  const { nights, total } = calculatePrice(s, e, hasExtra, hasDecoration);

  // Construir payload para backend
  const payload = {
    client_name,
    client_phone,
    client_email,
    check_in,
    check_out,
    extra_person,
    decoration,
    decoration_reason: decoReason || null,
    extras
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      formMessageEl.textContent = data.error || 'Ocurrió un error al registrar tu reserva.';
      formMessageEl.classList.add('error');
      return;
    }

    formMessageEl.textContent = '✅ Tu solicitud de reserva ha sido registrada. Te contactaremos por WhatsApp para confirmar.';
    formMessageEl.classList.add('success');

    // Enviar mensaje de WhatsApp abriendo enlace automáticamente
    const personas = hasExtra ? 3 : 2;
    const decoText = decoration
      ? (decoReason ? `Sí (${decoReason})` : 'Sí')
      : 'No';

    const text =
      `Hola Brumae, quiero reservar del ${check_in} al ${check_out} ` +
      `(${nights} noche(s)) para ${personas} persona(s). ` +
      `Persona extra: ${hasExtra ? 'Sí' : 'No'}. ` +
      `Decoración especial: ${decoText}. ` +
      `Total estimado: ${formatCOP(total)}. ` +
      `Soy ${client_name}. Mi WhatsApp es ${client_phone}. ` +
      (extras ? `Comentarios: ${extras}.` : '');

    const waUrl =
      `https://api.whatsapp.com/send/?phone=${ADMIN_WHATSAPP}` +
      `&text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`;

    window.open(waUrl, '_blank');

    // Opcional: limpiar formulario, pero dejar fechas seleccionadas
    // event.target.reset(); // si quisieras resetear

  } catch (err) {
    console.error(err);
    formMessageEl.textContent = 'Error de conexión con el servidor. Inténtalo de nuevo.';
    formMessageEl.classList.add('error');
  }
}

// ====== CARRUSEL (dots + flechas) ======

function initCarousel() {
  const track = document.querySelector('.carousel-track');
  const dots = document.querySelectorAll('.carousel-dots .dot');
  const prevBtn = document.querySelector('.carousel-btn.prev');
  const nextBtn = document.querySelector('.carousel-btn.next');

  if (!track) return;

  // Actualizar punticos al hacer scroll
  if (dots.length) {
    track.addEventListener('scroll', () => {
      const scrollLeft = track.scrollLeft;
      const width = track.clientWidth;
      const index = Math.round(scrollLeft / width);

      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    });

    // Click en punticos
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        track.scrollTo({
          left: track.clientWidth * index,
          behavior: 'smooth'
        });
      });
    });
  }

  // Flechas
  if (prevBtn && nextBtn) {
    nextBtn.addEventListener('click', () => {
      track.scrollTo({
        left: track.scrollLeft + track.clientWidth,
        behavior: 'smooth'
      });
    });

    prevBtn.addEventListener('click', () => {
      track.scrollTo({
        left: track.scrollLeft - track.clientWidth,
        behavior: 'smooth'
      });
    });
  }
}

// ====== INIT ======

document.addEventListener('DOMContentLoaded', () => {
  dateRangePickerEl = document.getElementById('dateRangePicker');
  summaryBoxEl = document.getElementById('summaryBox');
  extraPersonChk = document.getElementById('extra_person');
  decorationChk = document.getElementById('decoration');
  decorationReasonSel = document.getElementById('decoration_reason');
  decorationReasonCustomInput = document.getElementById('decoration_reason_custom');
  decorationReasonGroup = document.getElementById('decorationReasonGroup');
  decorationReasonCustomGroup = document.getElementById('decorationReasonCustomGroup');
  formMessageEl = document.getElementById('formMessage');

  // Configurar calendario
  const today = new Date();
  currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderCalendar(currentMonth);
  loadFullyBookedDates();

  // Listeners de checkboxes para actualizar resumen
  if (extraPersonChk) {
    extraPersonChk.addEventListener('change', updateSummary);
  }
  if (decorationChk) {
    decorationChk.addEventListener('change', () => {
      const show = decorationChk.checked;
      decorationReasonGroup.style.display = show ? 'block' : 'none';
      decorationReasonCustomGroup.style.display = 'none';
      if (!show) {
        decorationReasonSel.value = '';
        decorationReasonCustomInput.value = '';
      }
      updateSummary();
    });
  }

  if (decorationReasonSel) {
    decorationReasonSel.addEventListener('change', () => {
      if (decorationReasonSel.value === 'Otra') {
        decorationReasonCustomGroup.style.display = 'block';
      } else {
        decorationReasonCustomGroup.style.display = 'none';
        decorationReasonCustomInput.value = '';
      }
    });
  }

  // Formulario de reserva
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', handleSubmit);
  }

  // Carrusel
  initCarousel();
});
