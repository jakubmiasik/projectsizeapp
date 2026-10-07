// Microsoft Graph directory lookup for the "Manage Access" people picker.
//
// The picker used to search the app's own app_users table, which only ever
// contained people who had already been granted access. Searching Entra
// instead means you can share with anyone in the company directory.
//
// Auth reuses the pattern the SQL connection already relies on: the App
// Service managed identity via DefaultAzureCredential. That identity needs the
// Graph application permission User.ReadBasic.All with admin consent; see
// README.md. No client secret is stored anywhere in this app.

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

let credential = null;
let cachedToken = null;

function getCredential() {
  if (!credential) {
    // Required lazily so the module can be loaded (and unit-tested) on a
    // machine that has no Azure identity available.
    const { DefaultAzureCredential } = require('@azure/identity');
    credential = new DefaultAzureCredential();
  }
  return credential;
}

function graphError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  if (status) err.status = status;
  return err;
}

async function getAccessToken() {
  // Tokens are good for ~1h. Re-request a minute early so a long request can
  // never start with a token that expires mid-flight.
  if (cachedToken && cachedToken.expiresOnTimestamp - Date.now() > 60_000) {
    return cachedToken.token;
  }

  let token;
  try {
    token = await getCredential().getToken(GRAPH_SCOPE);
  } catch (err) {
    throw graphError(
      'Could not obtain a Microsoft Graph token for the app identity.',
      'GRAPH_AUTH_FAILED'
    );
  }

  if (!token?.token) {
    throw graphError(
      'Could not obtain a Microsoft Graph token for the app identity.',
      'GRAPH_AUTH_FAILED'
    );
  }

  cachedToken = token;
  return token.token;
}

// $search is tokenised and quoted, so a stray double quote would break out of
// the expression. Strip the characters that carry meaning rather than trying
// to escape them.
function sanitizeQuery(value) {
  return String(value || '').replace(/["\\]/g, ' ').trim();
}

/**
 * Search the Entra directory for people, returning at most `top` matches in
 * the shape the share picker expects: { email, display_name, directory_id }.
 */
async function searchDirectoryUsers(query, top = 10) {
  const term = sanitizeQuery(query);
  if (term.length < 2) return [];

  const token = await getAccessToken();

  // $search matches on prefixes of each token, which is what someone typing a
  // partial name expects. It requires the eventual-consistency header.
  const search = encodeURIComponent(
    `"displayName:${term}" OR "mail:${term}" OR "userPrincipalName:${term}"`
  );
  const url =
    `${GRAPH_BASE}/users?$search=${search}` +
    `&$select=id,displayName,mail,userPrincipalName&$top=${Number(top) || 10}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: 'eventual',
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw graphError(
        'The app identity is not allowed to read the directory. Grant it the ' +
          'Graph permission User.ReadBasic.All and admin-consent it.',
        'GRAPH_FORBIDDEN',
        res.status
      );
    }
    throw graphError(
      `Microsoft Graph returned ${res.status}: ${body.slice(0, 300)}`,
      'GRAPH_REQUEST_FAILED',
      res.status
    );
  }

  const payload = await res.json();
  return (payload.value || [])
    .map((user) => ({
      // Guests and some service accounts have no mail; userPrincipalName is
      // the dependable fallback and is what the user signs in with.
      email: (user.mail || user.userPrincipalName || '').trim(),
      display_name: (user.displayName || '').trim(),
      directory_id: user.id
    }))
    .filter((user) => user.email);
}

function isGraphConfigError(err) {
  return err?.code === 'GRAPH_AUTH_FAILED' || err?.code === 'GRAPH_FORBIDDEN';
}

module.exports = {
  searchDirectoryUsers,
  isGraphConfigError
};
