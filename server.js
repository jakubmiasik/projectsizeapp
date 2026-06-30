const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// Application Insights
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = require('applicationinsights');
  appInsights.setup().setSendLiveMetrics(true).start();
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Extract user identity from App Service EasyAuth headers
function getUser(req) {
  const principal = req.headers['x-ms-client-principal'];
  if (!principal) return null;

  try {
    const decoded = JSON.parse(Buffer.from(principal, 'base64').toString('utf8'));
    const claims = decoded.claims || [];
    const getClaim = (type) => {
      const claim = claims.find(c => c.typ === type);
      return claim ? claim.val : null;
    };

    return {
      oid: getClaim('http://schemas.microsoft.com/identity/claims/objectidentifier') || decoded.userId,
      name: getClaim('name') || getClaim('preferred_username') || 'Unknown',
      email: getClaim('preferred_username') || getClaim('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress') || ''
    };
  } catch {
    return null;
  }
}

function isValidRole(role) {
 return role === 'admin' || role === 'explorer';
}

async function resolveUserAccess(user) {
 const configuredUserCount = await db.countAppUsers();
 if (configuredUserCount === 0) {
   return { role: 'explorer', configuredUserCount };
 }

 const appUser = user.email ? await db.getUserRole(user.email) : null;
 return {
   role: appUser?.role || null,
   displayName: appUser?.display_name || '',
   configuredUserCount
 };
}

// Auth middleware
async function requireAuth(req, res, next) {
 const user = getUser(req);
 if (!user) {
   return res.status(401).json({ error: 'Authentication required' });
 }

 try {
   const access = await resolveUserAccess(user);
   req.user = { ...user, role: access.role };

   if (!access.role) {
     return res.status(403).json({
       ...user,
       role: null,
       error: 'Access denied. Contact an administrator.'
     });
   }

   next();
 } catch (err) {
   console.error('Failed to validate user access:', err);
   res.status(500).json({ error: 'Failed to validate access' });
 }
}

function requireAdmin(req, res, next) {
 if (req.user?.role !== 'admin') {
   return res.status(403).json({ error: 'Admin access required' });
 }
 next();
}

// Health check - always return 200 so App Service doesn't kill the container
app.get('/health', async (_req, res) => {
  try {
    await db.healthCheck();
    res.json({ status: 'healthy', db: 'connected' });
  } catch (err) {
    res.json({ status: 'healthy', db: 'disconnected', dbError: err.message });
  }
});

// Get current user info
app.get('/api/user', requireAuth, (req, res) => {
  res.json(req.user);
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const users = await db.listAppUsers();
    res.json(users);
  } catch (err) {
    console.error('Failed to list app users:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const role = String(req.body?.role || '').trim().toLowerCase();

    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!isValidRole(role)) return res.status(400).json({ error: 'Invalid role' });

    const user = await db.addAppUser({ email, displayName, role });
    res.status(201).json(user);
  } catch (err) {
    console.error('Failed to add app user:', err);
    const status = err.number === 2627 || err.number === 2601 ? 409 : 500;
    res.status(status).json({ error: status === 409 ? 'User already exists' : 'Failed to add user' });
  }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const role = String(req.body?.role || '').trim().toLowerCase();
    if (!isValidRole(role)) return res.status(400).json({ error: 'Invalid role' });

    const user = await db.updateAppUserRole(req.params.id, role);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Failed to update app user role:', err);
    const status = err.code === 'LAST_ADMIN' ? 400 : 500;
    res.status(status).json({ error: err.code === 'LAST_ADMIN' ? err.message : 'Failed to update user role' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deleted = await db.deleteAppUser(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete app user:', err);
    const status = err.code === 'LAST_ADMIN' ? 400 : 500;
    res.status(status).json({ error: err.code === 'LAST_ADMIN' ? err.message : 'Failed to delete user' });
  }
});

app.get('/api/admin/estimations', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const estimations = await db.listAllEstimations();
    res.json(estimations);
  } catch (err) {
    console.error('Failed to list admin estimations:', err);
    res.status(500).json({ error: 'Failed to load estimations' });
  }
});

app.get('/api/admin/estimations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const estimation = await db.getEstimationForAdmin(req.params.id);
    if (!estimation) return res.status(404).json({ error: 'Not found' });
    res.json(estimation);
  } catch (err) {
    console.error('Failed to get admin estimation:', err);
    res.status(500).json({ error: 'Failed to load estimation' });
  }
});

app.delete('/api/admin/estimations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deleted = await db.deleteEstimationAsAdmin(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete estimation as admin:', err);
    res.status(500).json({ error: 'Failed to delete estimation' });
  }
});

// List estimations for logged-in user
app.get('/api/estimations', requireAuth, async (req, res) => {
  try {
    const estimations = await db.listEstimations(req.user.oid);
    res.json(estimations);
  } catch (err) {
    console.error('Failed to list estimations:', err);
    res.status(500).json({ error: 'Failed to load estimations' });
  }
});

// Get a specific estimation
app.get('/api/estimations/:id', requireAuth, async (req, res) => {
  try {
    const estimation = await db.getEstimation(req.params.id, req.user.oid);
    if (!estimation) return res.status(404).json({ error: 'Not found' });
    res.json(estimation);
  } catch (err) {
    console.error('Failed to get estimation:', err);
    res.status(500).json({ error: 'Failed to load estimation' });
  }
});

// List versions for an estimation group
app.get('/api/estimations/:id/versions', requireAuth, async (req, res) => {
  try {
    const versions = await db.listEstimationVersions(req.params.id, req.user.oid);
    res.json(versions);
  } catch (err) {
    console.error('Failed to list estimation versions:', err);
    res.status(500).json({ error: 'Failed to load estimation versions' });
  }
});

// Save a new estimation
app.post('/api/estimations', requireAuth, async (req, res) => {
  try {
    const { title, data, parentId } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing estimation data' });

    const clientName = data.clientName || '';
    const estimationTitle = title || `${clientName || 'Untitled'} - ${new Date().toLocaleDateString()}`;

    const estimation = await db.saveEstimation({
      userOid: req.user.oid,
      userName: req.user.name,
      clientName,
      title: estimationTitle,
      data,
      parentId
    });
    res.status(201).json(estimation);
  } catch (err) {
    console.error('Failed to save estimation:', err);
    res.status(500).json({ error: 'Failed to save estimation' });
  }
});

// Update an existing estimation
app.put('/api/estimations/:id', requireAuth, async (req, res) => {
  try {
    const { title, data } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing estimation data' });

    const clientName = data.clientName || '';
    const estimationTitle = title || `${clientName || 'Untitled'} - ${new Date().toLocaleDateString()}`;
    const estimation = await db.updateEstimation({
      id: req.params.id,
      userOid: req.user.oid,
      userName: req.user.name,
      clientName,
      title: estimationTitle,
      data
    });

    if (!estimation) return res.status(404).json({ error: 'Not found' });
    res.json(estimation);
  } catch (err) {
    console.error('Failed to update estimation:', err);
    res.status(500).json({ error: 'Failed to update estimation' });
  }
});

// Delete an estimation
app.delete('/api/estimations/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteEstimation(req.params.id, req.user.oid);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete estimation:', err);
    res.status(500).json({ error: 'Failed to delete estimation' });
  }
});

// Login endpoint - redirects to EasyAuth login
app.get('/login', (_req, res) => {
  res.redirect('/.auth/login/aad?post_login_redirect_uri=/');
});

// SPA fallback - serve the page (auth check happens client-side)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  // Start HTTP server immediately so health probes succeed
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Initialize database in background - retry on failure
  const maxRetries = 5;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await db.initialize();
      console.log('Database connected successfully');
      return;
    } catch (err) {
      console.error(`Database init attempt ${i}/${maxRetries} failed:`, err.message);
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, 5000 * i));
      }
    }
  }
  console.error('Database initialization failed after retries - API routes will return errors until DB is available');
}

start().catch(err => {
  console.error('Failed to start server:', err);
});
