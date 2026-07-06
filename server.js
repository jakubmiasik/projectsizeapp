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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
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

async function userOwnsEstimationGroup(groupId, userOid) {
  const versions = await db.listEstimationVersions(groupId, userOid);
  return versions.length > 0;
}

function requireUserEmail(req, res) {
  if (!req.user?.email) {
    res.status(400).json({ error: 'Signed-in user email is required' });
    return false;
  }
  return true;
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

// Track active users (email → { name, lastSeen })
const activeUsers = new Map();
const ACTIVE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function trackActiveUser(req) {
  if (req.user?.email) {
    activeUsers.set(req.user.email.toLowerCase(), {
      name: req.user.name,
      lastSeen: Date.now()
    });
  }
}

function getActiveEmails() {
  const now = Date.now();
  const active = [];
  for (const [email, data] of activeUsers) {
    if (now - data.lastSeen <= ACTIVE_TIMEOUT_MS) {
      active.push(email);
    } else {
      activeUsers.delete(email);
    }
  }
  return active;
}

// Copilot Studio token proxy with OBO (On-Behalf-Of) token exchange
const COPILOT_TOKEN_ENDPOINT = process.env.COPILOT_TOKEN_ENDPOINT ||
  'https://default1dc9b339fadb432e86df423c38a0fc.b8.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cre2f_Offeringsv2/conversations?api-version=2022-03-01-preview';

// Exchange id_token for a Power Platform access token via OBO flow
async function exchangeTokenForPowerPlatform(idToken) {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    const missing = [];
    if (!clientId) missing.push('AZURE_CLIENT_ID');
    if (!clientSecret) missing.push('AZURE_CLIENT_SECRET');
    if (!tenantId) missing.push('AZURE_TENANT_ID');
    throw new Error('Missing env vars for OBO flow: ' + missing.join(', '));
  }

  const tokenUrl = 'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/token';
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: clientId,
    client_secret: clientSecret,
    assertion: idToken,
    scope: 'https://api.powerplatform.com/CopilotStudio.Copilots.Invoke',
    requested_token_use: 'on_behalf_of'
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('OBO token exchange failed:', data);
    throw new Error('OBO exchange failed: ' + (data.error_description || data.error || resp.status));
  }
  return data.access_token;
}

app.post('/api/copilot-token', requireAuth, async (req, res) => {
  try {
    const idToken = req.headers['x-ms-token-aad-id-token'];
    const existingAccessToken = req.headers['x-ms-token-aad-access-token'];

    console.log('Copilot token request - has access_token:', !!existingAccessToken,
      ', has id_token:', !!idToken);

    let bearerToken;
    if (existingAccessToken) {
      bearerToken = existingAccessToken;
    } else if (idToken) {
      bearerToken = await exchangeTokenForPowerPlatform(idToken);
    } else {
      return res.status(401).json({
        error: 'No EasyAuth token available. Enable Token Store in App Service Authentication settings.'
      });
    }

    const response = await fetch(COPILOT_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + bearerToken
      }
    });

    const text = await response.text();
    if (!response.ok) {
      console.error('Copilot token error:', response.status, text);
      return res.status(502).json({
        error: 'Copilot Studio returned ' + response.status + ': ' + text.substring(0, 200)
      });
    }

    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    res.json(data);
  } catch (err) {
    console.error('Copilot token fetch failed:', err);
    res.status(502).json({ error: err.message });
  }
});

// Diagnostic: check what EasyAuth tokens are available (admin only)
app.get('/api/admin/token-debug', requireAuth, requireAdmin, (req, res) => {
  res.json({
    hasAccessToken: !!req.headers['x-ms-token-aad-access-token'],
    hasIdToken: !!req.headers['x-ms-token-aad-id-token'],
    hasRefreshToken: !!req.headers['x-ms-token-aad-refresh-token'],
    authHeaders: Object.keys(req.headers).filter(h => h.startsWith('x-ms-'))
  });
});

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
  trackActiveUser(req);
  res.json(req.user);
});

app.get('/api/admin/active-users', requireAuth, requireAdmin, (_req, res) => {
  res.json(getActiveEmails());
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
    const email = normalizeEmail(req.body?.email);
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

app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const query = String(req.query?.q || '').trim();
    if (query.length < 2) {
      return res.json([]);
    }

    const users = await db.searchUsers(query);
    const currentUserEmail = normalizeEmail(req.user.email);
    res.json(users.filter((user) => normalizeEmail(user.email) !== currentUserEmail));
  } catch (err) {
    console.error('Failed to search users:', err);
    res.status(500).json({ error: 'Failed to search users' });
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

app.get('/api/estimations/shared-with-me', requireAuth, async (req, res) => {
  if (!requireUserEmail(req, res)) return;

  try {
    const estimations = await db.listSharedWithMe(req.user.email);
    res.json(estimations);
  } catch (err) {
    console.error('Failed to list shared estimations:', err);
    res.status(500).json({ error: 'Failed to load shared estimations' });
  }
});

app.get('/api/estimations/shared/:id', requireAuth, async (req, res) => {
  if (!requireUserEmail(req, res)) return;

  try {
    const estimation = await db.getSharedEstimation(req.params.id, req.user.email);
    if (!estimation) return res.status(404).json({ error: 'Not found' });
    res.json(estimation);
  } catch (err) {
    console.error('Failed to get shared estimation:', err);
    res.status(500).json({ error: 'Failed to load shared estimation' });
  }
});

app.get('/api/estimations/:groupId/shares', requireAuth, async (req, res) => {
  try {
    const ownsGroup = await userOwnsEstimationGroup(req.params.groupId, req.user.oid);
    if (!ownsGroup) return res.status(404).json({ error: 'Not found' });

    const shares = await db.listSharesForEstimation(req.params.groupId);
    res.json(shares);
  } catch (err) {
    console.error('Failed to list estimation shares:', err);
    res.status(500).json({ error: 'Failed to load estimation shares' });
  }
});

app.post('/api/estimations/:groupId/share', requireAuth, async (req, res) => {
  try {
    const ownsGroup = await userOwnsEstimationGroup(req.params.groupId, req.user.oid);
    if (!ownsGroup) return res.status(404).json({ error: 'Not found' });

    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (email === normalizeEmail(req.user.email)) {
      return res.status(400).json({ error: 'You cannot share an estimation with yourself' });
    }

    const targetUser = await db.getAppUserByEmail(email);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const share = await db.shareEstimation(req.params.groupId, req.user.oid, req.user.name, targetUser.email);
    res.status(201).json(share);
  } catch (err) {
    console.error('Failed to share estimation:', err);
    res.status(500).json({ error: 'Failed to share estimation' });
  }
});

app.delete('/api/estimations/:groupId/share/:email', requireAuth, async (req, res) => {
  try {
    const ownsGroup = await userOwnsEstimationGroup(req.params.groupId, req.user.oid);
    if (!ownsGroup) return res.status(404).json({ error: 'Not found' });

    await db.unshareEstimation(req.params.groupId, normalizeEmail(req.params.email));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to unshare estimation:', err);
    res.status(500).json({ error: 'Failed to remove share' });
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
