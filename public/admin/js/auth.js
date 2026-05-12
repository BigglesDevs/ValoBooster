const page = location.pathname;

// ── Login ─────────────────────────────────────────────────────────────────────
if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('err');
    err.textContent = '';
    const res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:    document.getElementById('email').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) return (err.textContent = data.error || 'Login failed');
    location.href = data.must_reset ? '/admin/reset-password' : '/admin';
  });
}

// ── First-run setup ───────────────────────────────────────────────────────────
if (document.getElementById('setupForm')) {
  document.getElementById('setupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('err');
    err.textContent = '';
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm').value;
    if (password !== confirm) return (err.textContent = 'Passwords do not match');
    const res = await fetch('/admin/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:        document.getElementById('email').value,
        password,
        display_name: document.getElementById('display_name').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) return (err.textContent = data.error || 'Setup failed');
    location.href = '/admin/login';
  });
}

// ── Password reset ────────────────────────────────────────────────────────────
if (document.getElementById('resetForm')) {
  document.getElementById('resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('err');
    err.textContent = '';
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm').value;
    if (password !== confirm) return (err.textContent = 'Passwords do not match');
    const res = await fetch('/admin/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return (err.textContent = data.error || 'Failed to update password');
    location.href = '/admin';
  });
}
