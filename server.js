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

// Auth middleware
function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
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

// Save a new estimation
app.post('/api/estimations', requireAuth, async (req, res) => {
  try {
    const { title, data } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing estimation data' });

    const clientName = data.clientName || '';
    const estimationTitle = title || `${clientName || 'Untitled'} - ${new Date().toLocaleDateString()}`;

    const id = await db.saveEstimation({
      userOid: req.user.oid,
      userName: req.user.name,
      clientName,
      title: estimationTitle,
      data
    });
    res.status(201).json({ id, title: estimationTitle });
  } catch (err) {
    console.error('Failed to save estimation:', err);
    res.status(500).json({ error: 'Failed to save estimation' });
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
