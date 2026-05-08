// Config is loaded from config.js (excluded from git).
// All sensitive values live there — do not hardcode them here.

// ============================================================
// RANK LADDER — every division in order, lowest to highest
// ============================================================
const RANKS = [
  'Iron I',       'Iron II',       'Iron III',
  'Bronze I',     'Bronze II',     'Bronze III',
  'Silver I',     'Silver II',     'Silver III',
  'Gold I',       'Gold II',       'Gold III',
  'Platinum I',   'Platinum II',   'Platinum III',
  'Diamond I',    'Diamond II',    'Diamond III',
  'Ascendant I',  'Ascendant II',  'Ascendant III',
  'Immortal I',   'Immortal II',   'Immortal III',
  'Radiant',
];

// Cost to go from RANKS[i] to RANKS[i+1] — 24 steps
// Calibrated so Iron I → Gold II ≈ $90, matching market leaders
const DIV_PRICE = [
  6.49, 6.49,  // Iron I→II, II→III
  6.49,        // Iron III→Bronze I
  7.99, 7.99,  // Bronze I→II, II→III
  7.99,        // Bronze III→Silver I
  10.99, 10.99,// Silver I→II, II→III
  10.99,       // Silver III→Gold I
  13.99, 13.99,// Gold I→II, II→III
  13.99,       // Gold III→Platinum I
  19.99, 19.99,// Platinum I→II, II→III
  19.99,       // Platinum III→Diamond I
  27.99, 27.99,// Diamond I→II, II→III
  27.99,       // Diamond III→Ascendant I
  39.99, 39.99,// Ascendant I→II, II→III
  39.99,       // Ascendant III→Immortal I
  54.99, 54.99,// Immortal I→II, II→III
  129.99,      // Immortal III→Radiant
];

// Fixed prices for non-rank services
const FIXED_PRICES = {
  'wins-5':   24.99,
  'wins-10':  44.99,
  'wins-20':  79.99,
  'place-5':  29.99,
  'place-10': 54.99,
};

// Boost mode multipliers
const BOOST_MODE_MULT = { shared: 1.00, selfplay: 1.35 };

// Platform multipliers
const PLATFORM_MULT = { pc: 1.00, ps5: 1.10, xbox: 1.10 };

// Region multipliers
const REGION_MULT = {
  na: 1.00, eu: 1.00, tr: 1.00,
  oce: 1.10, lan: 1.10, sea: 1.10,
  jp: 1.15, kr: 1.15,
};

const REGION_LABEL = {
  na: 'NA', eu: 'EU', tr: 'TR',
  oce: 'OCE', lan: 'LAN', sea: 'SEA', jp: 'JP', kr: 'KR',
};

// Addon IDs → percent values (read from checkbox value)
const ADDON_IDS = ['addonExpress','addonSolo','addonAgents'];
const ADDON_LABEL = {
  addonExpress: 'Express Priority',
  addonSolo:    'Solo Queue Only',
  addonAgents:  'Specific Agents',
};

// Active promo codes
const PROMO_CODES = {
  SAVE20:  0.20,
  BOOST15: 0.15,
  LOYAL10: 0.10,
  FIRST50: 0.50,
};

let activeDiscount = 0;
let activeCode     = '';
let rankBasePrice  = 0;  // set by rank calculator

// ============================================================
// UTILITY: calculate price between two ranks
// ============================================================
function calcRankPrice(from, to) {
  const fi = RANKS.indexOf(from);
  const ti = RANKS.indexOf(to);
  if (fi < 0 || ti < 0 || ti <= fi) return 0;
  let total = 0;
  for (let i = fi; i < ti; i++) total += DIV_PRICE[i];
  return total;
}

// ============================================================
// PROMO BANNER CLOSE
// ============================================================
document.getElementById('promoBannerClose').addEventListener('click', () => {
  document.getElementById('promoBanner').style.display = 'none';
});

// ============================================================
// HAMBURGER
// ============================================================
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('open')));

// ============================================================
// SERVICE TABS
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ============================================================
// FAQ ACCORDION
// ============================================================
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item   = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ============================================================
// LIVE ACTIVITY COUNTER
// ============================================================
const liveCountEl = document.getElementById('liveCount');
let liveCount = 47;
setInterval(() => {
  liveCount = Math.max(30, Math.min(80, liveCount + (Math.floor(Math.random() * 3) - 1)));
  if (liveCountEl) liveCountEl.textContent = liveCount;
}, 6000);

// ============================================================
// RANK CALCULATOR (top hero widget)
// ============================================================
const fromRankSel    = document.getElementById('fromRank');
const toRankSel      = document.getElementById('toRank');
const calcHeroPrice  = document.getElementById('calcHeroPrice');
const calcHeroDivs   = document.getElementById('calcHeroDivs');
const rankSummaryEl  = document.getElementById('rankSummaryRanks');

function updateCalc() {
  const from = fromRankSel.value;
  const to   = toRankSel.value;

  if (!from || !to) {
    calcHeroPrice.textContent = '—';
    calcHeroDivs.textContent  = '';
    calcHeroPrice.style.fontSize = '2rem';
    rankBasePrice = 0;
    updateRankSummary();
    updateOrderTotal();
    return;
  }

  const fi = RANKS.indexOf(from);
  const ti = RANKS.indexOf(to);

  if (ti <= fi) {
    calcHeroPrice.textContent    = 'Pick a higher rank';
    calcHeroPrice.style.fontSize = '1rem';
    calcHeroDivs.textContent     = '';
    rankBasePrice = 0;
    updateRankSummary();
    updateOrderTotal();
    return;
  }

  calcHeroPrice.style.fontSize = '2rem';
  rankBasePrice = calcRankPrice(from, to);
  const divs = ti - fi;
  calcHeroPrice.textContent = '$' + rankBasePrice.toFixed(2);
  calcHeroDivs.textContent  = divs + ' division' + (divs !== 1 ? 's' : '') + ' to climb';
  updateRankSummary();
  updateOrderTotal();
}

function updateRankSummary() {
  if (!rankSummaryEl) return;
  const from = fromRankSel.value;
  const to   = toRankSel.value;
  if (from && to && rankBasePrice > 0) {
    rankSummaryEl.innerHTML =
      `<span class="rsumm-from">${from}</span>` +
      `<span class="rsumm-arrow">&#8594;</span>` +
      `<span class="rsumm-to">${to}</span>` +
      `<span class="rsumm-price">$${rankBasePrice.toFixed(2)} base</span>`;
  } else {
    rankSummaryEl.innerHTML = '<span class="rank-summary-hint">&#8593; Use the price calculator above to select your ranks</span>';
  }
}

fromRankSel.addEventListener('change', updateCalc);
toRankSel.addEventListener('change',   updateCalc);

// ============================================================
// SERVICE / MODE / PLATFORM / REGION LISTENERS
// ============================================================
const serviceTypeSel = document.getElementById('serviceType');
const boostModeSel   = document.getElementById('boostMode');
const platformSel    = document.getElementById('platform');
const regionSel      = document.getElementById('region');

[serviceTypeSel, boostModeSel, platformSel, regionSel].forEach(el => {
  if (el) el.addEventListener('change', updateOrderTotal);
});

// Addon checkboxes
ADDON_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', updateOrderTotal);
});


// Show agent input when Specific Agents is checked
const addonAgents     = document.getElementById('addonAgents');
const agentSelectWrap = document.getElementById('agentSelectWrap');
if (addonAgents && agentSelectWrap) {
  addonAgents.addEventListener('change', () => {
    agentSelectWrap.style.display = addonAgents.checked ? 'flex' : 'none';
  });
}

// ============================================================
// ORDER TOTAL — master recalculation
// ============================================================
const totalDisplay   = document.getElementById('totalDisplay');
const totalBreakdown = document.getElementById('totalBreakdown');

function getAddonTotal(base) {
  let pct = 0;
  let lines = [];
  ADDON_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.checked) {
      const val = parseFloat(el.value);
      if (val > 0) {
        pct += val;
        lines.push({ label: ADDON_LABEL[id], pct: val, amt: base * val });
      }
    }
  });
  return { pct, lines };
}

function updateOrderTotal() {
  const svcType  = serviceTypeSel ? serviceTypeSel.value : 'rank';
  const modeMult = BOOST_MODE_MULT[boostModeSel ? boostModeSel.value : 'shared'] || 1;
  const platMult = PLATFORM_MULT[platformSel ? platformSel.value : 'pc'] || 1;
  const regMult  = REGION_MULT[regionSel ? regionSel.value : 'na'] || 1;

  let base  = 0;
  let label = '';

  if (svcType === 'rank') {
    base  = rankBasePrice;
    label = fromRankSel.value && toRankSel.value
      ? `${fromRankSel.value} → ${toRankSel.value}`
      : 'Rank Boost';
  } else {
    base  = FIXED_PRICES[svcType] || 0;
    label = serviceTypeSel.selectedOptions[0].text.split(' — ')[0];
  }

  if (base === 0) {
    totalDisplay.textContent = '$0.00';
    totalBreakdown.innerHTML = '<span class="breakdown-hint">&#8593; Select your ranks above to see the price breakdown</span>';
    return 0;
  }

  // Apply mode / platform / region
  const afterOptions = base * modeMult * platMult * regMult;

  // Addons on top of options price
  const { lines: addonLines } = getAddonTotal(afterOptions);
  const addonTotal = addonLines.reduce((s, a) => s + a.amt, 0);
  const afterAddons = afterOptions + addonTotal;

  // Promo discount
  const discountAmt = afterAddons * activeDiscount;
  const total       = afterAddons - discountAmt;

  // Build breakdown HTML
  let html = `<span><strong>${label}</strong></span>`;
  html += `<span>Base: $${base.toFixed(2)}</span>`;

  if (modeMult !== 1) {
    const mode = boostModeSel.value === 'selfplay' ? 'Self-Play/Duo' : '';
    html += `<span>${mode}: +35% (+$${(base * modeMult - base).toFixed(2)})</span>`;
  }
  if (platMult !== 1) {
    const plat = platformSel.value.toUpperCase();
    html += `<span>${plat}: +10% (+$${(base * platMult - base).toFixed(2)})</span>`;
  }
  if (regMult !== 1) {
    const reg   = REGION_LABEL[regionSel.value] || '';
    const pct   = Math.round((regMult - 1) * 100);
    html += `<span>Region ${reg}: +${pct}% (+$${(base * regMult - base).toFixed(2)})</span>`;
  }
  addonLines.forEach(a => {
    html += `<span>${a.label}: +${Math.round(a.pct * 100)}% (+$${a.amt.toFixed(2)})</span>`;
  });
  if (activeDiscount > 0) {
    html += `<span class="discount-line">Code ${activeCode}: -${Math.round(activeDiscount * 100)}% (-$${discountAmt.toFixed(2)})</span>`;
  }

  totalBreakdown.innerHTML = html;
  totalDisplay.textContent = '$' + total.toFixed(2);
  return total;
}

// ============================================================
// PROMO CODE
// ============================================================
document.getElementById('applyPromo').addEventListener('click', applyPromo);
document.getElementById('promoCode').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); applyPromo(); }
});

function applyPromo() {
  const input  = document.getElementById('promoCode');
  const result = document.getElementById('promoResult');
  const applyBtn = document.getElementById('applyPromo');
  const code   = input.value.trim().toUpperCase();

  if (!code) {
    result.className = 'promo-result error';
    result.textContent = 'Please enter a promo code.';
    return;
  }
  if (PROMO_CODES[code]) {
    activeDiscount = PROMO_CODES[code];
    activeCode     = code;
    const pct      = Math.round(activeDiscount * 100);
    result.className   = 'promo-result success';
    result.textContent = `Code applied — ${pct}% discount unlocked!`;
    input.disabled     = true;
    applyBtn.disabled  = true;
    applyBtn.textContent = '&#10003; Applied';
    updateOrderTotal();
  } else {
    result.className   = 'promo-result error';
    result.textContent = 'Invalid code. Try SAVE20 or BOOST15.';
  }
}

// ============================================================
// CARD BUTTONS → scroll to order form & pre-select service
// ============================================================
document.querySelectorAll('.buy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const pkg = btn.dataset.package;
    if (pkg) {
      serviceTypeSel.value = pkg;
      updateOrderTotal();
    }
    document.getElementById('order').scrollIntoView({ behavior: 'smooth' });
  });
});

// ============================================================
// MODAL
// ============================================================
const modalOverlay  = document.getElementById('modalOverlay');
const modalClose    = document.getElementById('modalClose');
const modalSummary  = document.getElementById('modalSummary');
const modalOriginal = document.getElementById('modalOriginal');
const modalTotalEl  = document.getElementById('modalTotal');
const modalDiscount = document.getElementById('modalDiscountBadge');
const modalCheckout = document.getElementById('modalCheckoutBtn');

function openModal(total, label) {
  const svcType  = serviceTypeSel.value;
  const base     = svcType === 'rank' ? rankBasePrice : (FIXED_PRICES[svcType] || 0);
  const modeMult = BOOST_MODE_MULT[boostModeSel ? boostModeSel.value : 'shared'] || 1;
  const platMult = PLATFORM_MULT[platformSel ? platformSel.value : 'pc'] || 1;
  const regMult  = REGION_MULT[regionSel ? regionSel.value : 'na'] || 1;
  const afterOptions = base * modeMult * platMult * regMult;
  const { lines: addonLines } = getAddonTotal(afterOptions);
  const addonTotal = addonLines.reduce((s, a) => s + a.amt, 0);
  const beforeDiscount = afterOptions + addonTotal;

  const modeText = boostModeSel && boostModeSel.value === 'selfplay' ? ' — Self-Play/Duo' : ' — Account Shared';
  const platText = platformSel ? ` | ${platformSel.value.toUpperCase()}` : '';
  const regText  = regionSel ? ` | ${REGION_LABEL[regionSel.value]}` : '';
  modalSummary.textContent = label + modeText + platText + regText;

  if (activeDiscount > 0 && beforeDiscount !== total) {
    modalOriginal.textContent = '$' + beforeDiscount.toFixed(2);
    modalDiscount.textContent = `${activeCode}: ${Math.round(activeDiscount * 100)}% off — saved $${(beforeDiscount - total).toFixed(2)}`;
  } else {
    modalOriginal.textContent = '';
    modalDiscount.textContent = '';
  }

  modalTotalEl.textContent  = '$' + total.toFixed(2);
  modalCheckout.dataset.svc = svcType;
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ============================================================
// FORM SUBMIT
// ============================================================
document.getElementById('orderForm').addEventListener('submit', e => {
  e.preventDefault();

  const svcType = serviceTypeSel.value;
  const name    = document.getElementById('name').value.trim();
  const email   = document.getElementById('email').value.trim();

  if (svcType === 'rank') {
    if (!fromRankSel.value || !toRankSel.value) {
      alert('Please select both your current rank and desired rank.'); return;
    }
    if (rankBasePrice === 0) {
      alert('Your desired rank must be higher than your current rank.'); return;
    }
  }
  if (!name || !email) { alert('Please fill in your name and email.'); return; }

  const total = updateOrderTotal();
  if (total === 0) { alert('Please select a service.'); return; }

  let label;
  if (svcType === 'rank') {
    label = `${fromRankSel.value} → ${toRankSel.value} Rank Boost`;
  } else {
    label = serviceTypeSel.selectedOptions[0].text.split(' — ')[0];
  }

  openModal(total, label);
});

// ============================================================
// STRIPE CHECKOUT
// ============================================================
modalCheckout.addEventListener('click', async () => {
  const svc         = modalCheckout.dataset.svc;
  const email       = document.getElementById('email').value.trim();
  const totalText   = document.getElementById('totalDisplay').textContent;
  const total       = parseFloat(totalText.replace('$', ''));
  const amountCents = Math.round(total * 100);

  if (!amountCents || amountCents < 100) {
    alert('Please select your ranks and complete the order form first.');
    return;
  }

  const modeName   = boostModeSel?.selectedOptions[0]?.text?.split(' —')[0] || '';
  const platName   = platformSel?.selectedOptions[0]?.text || '';
  const regName    = regionSel?.selectedOptions[0]?.text || '';
  const addonNames = ADDON_IDS
    .filter(id => document.getElementById(id)?.checked)
    .map(id => ADDON_LABEL[id])
    .join(', ') || null;

  const serviceDesc = svc === 'rank'
    ? `Rank Boost: ${fromRankSel?.selectedOptions[0]?.text} → ${toRankSel?.selectedOptions[0]?.text}`
    : serviceTypeSel?.selectedOptions[0]?.text?.split(' — ')[0] || svc;

  const reference = svc === 'rank'
    ? `${fromRankSel.value}_to_${toRankSel.value}`
    : svc;

  modalCheckout.disabled = true;
  modalCheckout.textContent = 'Redirecting to payment…';

  try {
    const res = await fetch('/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountCents,
        email,
        description: serviceDesc,
        reference,
        options: `${modeName} | ${platName} | ${regName}`,
        addons:  addonNames,
        promo:   activeCode || null,
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Checkout failed');
    }
  } catch (err) {
    alert('Something went wrong: ' + err.message + '\n\nPlease try again or contact support.');
    modalCheckout.disabled = false;
    modalCheckout.textContent = 'Proceed to Payment →';
  }
});

// ============================================================
// SMOOTH SCROLL
// ============================================================
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});
