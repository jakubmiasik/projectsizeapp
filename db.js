const sql = require('mssql');

let pool = null;

function getConfig() {
  const config = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE || 'fabricsizing',
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  };

  // Use managed identity in production (no password), connection string with password for local dev
  if (process.env.SQL_PASSWORD) {
    config.user = process.env.SQL_USER || 'sqladmin';
    config.password = process.env.SQL_PASSWORD;
    config.authentication = { type: 'default' };
  } else {
    config.authentication = {
      type: 'azure-active-directory-default'
    };
  }

  return config;
}

async function getPool() {
  if (!pool) {
    pool = await sql.connect(getConfig());
  }
  return pool;
}

async function initialize() {
  const p = await getPool();
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='estimations' AND xtype='U')
    CREATE TABLE estimations (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      user_oid NVARCHAR(255) NOT NULL,
      user_name NVARCHAR(255) NOT NULL,
      client_name NVARCHAR(255) DEFAULT '',
      title NVARCHAR(500) NOT NULL,
      data NVARCHAR(MAX) NOT NULL,
      version INT NOT NULL DEFAULT 1,
      parent_id UNIQUEIDENTIFIER NULL,
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    );

    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('estimations')
      AND name = 'version'
    )
    ALTER TABLE estimations ADD version INT NOT NULL CONSTRAINT DF_estimations_version DEFAULT 1 WITH VALUES;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('estimations')
      AND name = 'parent_id'
    )
    ALTER TABLE estimations ADD parent_id UNIQUEIDENTIFIER NULL;

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_estimations_user_oid')
    CREATE INDEX IX_estimations_user_oid ON estimations(user_oid);

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_estimations_parent_id')
    CREATE INDEX IX_estimations_parent_id ON estimations(parent_id);

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_users' AND xtype='U')
    CREATE TABLE app_users (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      email NVARCHAR(255) NOT NULL UNIQUE,
      display_name NVARCHAR(255) DEFAULT '',
      role NVARCHAR(50) NOT NULL DEFAULT 'explorer',
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    );

    IF NOT EXISTS (SELECT 1 FROM app_users WHERE email = 'admin@swotdempid302779.onmicrosoft.com')
    INSERT INTO app_users (email, display_name, role)
    VALUES ('admin@swotdempid302779.onmicrosoft.com', 'GSCD', 'admin');
  `);
  console.log('Database initialized');
}

async function healthCheck() {
  const p = await getPool();
  await p.request().query('SELECT 1');
}

async function listEstimations(userOid) {
  const p = await getPool();
  const result = await p.request()
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      SELECT
        latest.id,
        roots.id AS group_id,
        latest.parent_id,
        latest.client_name,
        latest.title,
        latest.created_at,
        latest.updated_at,
        latest.version,
        (
          SELECT COUNT(*)
          FROM estimations e2
          WHERE e2.user_oid = @userOid
            AND (e2.id = roots.id OR e2.parent_id = roots.id)
        ) AS version_count
      FROM (
        SELECT id
        FROM estimations
        WHERE user_oid = @userOid
          AND parent_id IS NULL
      ) roots
      CROSS APPLY (
        SELECT TOP 1 id, parent_id, client_name, title, created_at, updated_at, version
        FROM estimations latest
        WHERE latest.user_oid = @userOid
          AND (latest.id = roots.id OR latest.parent_id = roots.id)
        ORDER BY latest.version DESC, latest.updated_at DESC, latest.created_at DESC
      ) latest
      ORDER BY latest.updated_at DESC
    `);
  return result.recordset;
}

async function listAllEstimations() {
  const p = await getPool();
  const result = await p.request().query(`
    SELECT
      latest.id,
      roots.id AS group_id,
      latest.user_oid,
      latest.user_name,
      latest.client_name,
      latest.title,
      latest.created_at,
      latest.updated_at,
      latest.version,
      (
        SELECT COUNT(*)
        FROM estimations e2
        WHERE e2.user_oid = roots.user_oid
          AND (e2.id = roots.id OR e2.parent_id = roots.id)
      ) AS version_count
    FROM (
      SELECT id, user_oid
      FROM estimations
      WHERE parent_id IS NULL
    ) roots
    CROSS APPLY (
      SELECT TOP 1 id, user_oid, user_name, client_name, title, created_at, updated_at, version
      FROM estimations latest
      WHERE latest.user_oid = roots.user_oid
        AND (latest.id = roots.id OR latest.parent_id = roots.id)
      ORDER BY latest.version DESC, latest.updated_at DESC, latest.created_at DESC
    ) latest
    ORDER BY latest.updated_at DESC
  `);
  return result.recordset;
}

async function getEstimation(id, userOid) {
  const p = await getPool();
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      SELECT id, client_name, title, data, version, parent_id, created_at, updated_at
      FROM estimations
      WHERE id = @id AND user_oid = @userOid
    `);
  const row = result.recordset[0];
  if (!row) return null;
  row.data = JSON.parse(row.data);
  return row;
}

async function getEstimationForAdmin(id) {
  const p = await getPool();
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      SELECT id, client_name, title, data, version, parent_id, created_at, updated_at
      FROM estimations
      WHERE id = @id
    `);
  const row = result.recordset[0];
  if (!row) return null;
  row.data = JSON.parse(row.data);
  return row;
}

async function countAppUsers() {
  const p = await getPool();
  const result = await p.request().query(`
    SELECT COUNT(*) AS count
    FROM app_users
  `);
  return result.recordset[0]?.count || 0;
}

async function getAdminCount() {
  const p = await getPool();
  const result = await p.request().query(`
    SELECT COUNT(*) AS count
    FROM app_users
    WHERE role = 'admin'
  `);
  return result.recordset[0]?.count || 0;
}

async function getUserRole(email) {
  const p = await getPool();
  const result = await p.request()
    .input('email', sql.NVarChar, email)
    .query(`
      SELECT TOP 1 role, display_name
      FROM app_users
      WHERE LOWER(email) = LOWER(@email)
    `);
  return result.recordset[0] || null;
}

async function listAppUsers() {
  const p = await getPool();
  const result = await p.request().query(`
    SELECT id, email, display_name, role, created_at, updated_at
    FROM app_users
    ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, display_name ASC, email ASC
  `);
  return result.recordset;
}

async function addAppUser({ email, displayName, role }) {
  const p = await getPool();
  const result = await p.request()
    .input('email', sql.NVarChar, email)
    .input('displayName', sql.NVarChar, displayName)
    .input('role', sql.NVarChar, role)
    .query(`
      INSERT INTO app_users (email, display_name, role)
      OUTPUT INSERTED.id, INSERTED.email, INSERTED.display_name, INSERTED.role, INSERTED.created_at, INSERTED.updated_at
      VALUES (@email, @displayName, @role)
    `);
  return result.recordset[0];
}

async function updateAppUserRole(id, role) {
  const p = await getPool();
  const currentResult = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      SELECT id, role
      FROM app_users
      WHERE id = @id
    `);
  const currentUser = currentResult.recordset[0];
  if (!currentUser) return null;

  if (currentUser.role === 'admin' && role !== 'admin') {
    const adminCount = await getAdminCount();
    if (adminCount <= 1) {
      const error = new Error('Cannot remove the last admin');
      error.code = 'LAST_ADMIN';
      throw error;
    }
  }

  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('role', sql.NVarChar, role)
    .query(`
      UPDATE app_users
      SET role = @role,
          updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.email, INSERTED.display_name, INSERTED.role, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  return result.recordset[0] || null;
}

async function deleteAppUser(id) {
  const p = await getPool();
  const userResult = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      SELECT id, role
      FROM app_users
      WHERE id = @id
    `);
  const user = userResult.recordset[0];
  if (!user) return false;

  if (user.role === 'admin') {
    const adminCount = await getAdminCount();
    if (adminCount <= 1) {
      const error = new Error('Cannot delete the last admin');
      error.code = 'LAST_ADMIN';
      throw error;
    }
  }

  const deleteResult = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      DELETE FROM app_users
      WHERE id = @id
    `);
  return deleteResult.rowsAffected[0] > 0;
}

async function resolveParentId(id, userOid) {
  const p = await getPool();
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      SELECT id, parent_id
      FROM estimations
      WHERE id = @id AND user_oid = @userOid
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return row.parent_id || row.id;
}

async function getNextVersion(parentId, userOid) {
  const p = await getPool();
  const result = await p.request()
    .input('parentId', sql.UniqueIdentifier, parentId)
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      SELECT ISNULL(MAX(version), 0) + 1 AS next_version
      FROM estimations
      WHERE user_oid = @userOid
        AND (id = @parentId OR parent_id = @parentId)
    `);
  return result.recordset[0]?.next_version || 1;
}

async function saveEstimation({ userOid, userName, clientName, title, data, parentId = null }) {
  const p = await getPool();
  let resolvedParentId = null;
  let version = 1;

  if (parentId) {
    resolvedParentId = await resolveParentId(parentId, userOid);
    if (!resolvedParentId) {
      throw new Error('Parent estimation not found');
    }
    version = await getNextVersion(resolvedParentId, userOid);
  }

  const result = await p.request()
    .input('userOid', sql.NVarChar, userOid)
    .input('userName', sql.NVarChar, userName)
    .input('clientName', sql.NVarChar, clientName)
    .input('title', sql.NVarChar, title)
    .input('data', sql.NVarChar, JSON.stringify(data))
    .input('version', sql.Int, version)
    .input('parentId', sql.UniqueIdentifier, resolvedParentId)
    .query(`
      INSERT INTO estimations (user_oid, user_name, client_name, title, data, version, parent_id)
      OUTPUT INSERTED.id, INSERTED.title, INSERTED.client_name, INSERTED.version, INSERTED.parent_id, INSERTED.created_at, INSERTED.updated_at
      VALUES (@userOid, @userName, @clientName, @title, @data, @version, @parentId)
    `);
  return result.recordset[0];
}

async function updateEstimation({ id, userOid, userName, clientName, title, data }) {
  const p = await getPool();
  const parentId = await resolveParentId(id, userOid);
  if (!parentId) return null;

  const nextVersion = await getNextVersion(parentId, userOid);
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userOid', sql.NVarChar, userOid)
    .input('userName', sql.NVarChar, userName)
    .input('clientName', sql.NVarChar, clientName)
    .input('title', sql.NVarChar, title)
    .input('data', sql.NVarChar, JSON.stringify(data))
    .input('version', sql.Int, nextVersion)
    .query(`
      UPDATE estimations
      SET user_name = @userName,
          client_name = @clientName,
          title = @title,
          data = @data,
          version = @version,
          updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.title, INSERTED.client_name, INSERTED.version, INSERTED.parent_id, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id AND user_oid = @userOid
    `);
  return result.recordset[0] || null;
}

async function listEstimationVersions(parentId, userOid) {
  const resolvedParentId = await resolveParentId(parentId, userOid);
  if (!resolvedParentId) return [];

  const p = await getPool();
  const result = await p.request()
    .input('parentId', sql.UniqueIdentifier, resolvedParentId)
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      SELECT id, parent_id, client_name, title, version, created_at, updated_at
      FROM estimations
      WHERE user_oid = @userOid
        AND (id = @parentId OR parent_id = @parentId)
      ORDER BY version DESC, updated_at DESC, created_at DESC
    `);
  return result.recordset;
}

async function deleteEstimation(id, userOid) {
  const parentId = await resolveParentId(id, userOid);
  if (!parentId) return false;

  const p = await getPool();
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, parentId)
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      DELETE FROM estimations
      WHERE user_oid = @userOid
        AND (id = @id OR parent_id = @id)
    `);
  return result.rowsAffected[0] > 0;
}

async function deleteEstimationAsAdmin(id) {
  const p = await getPool();
  // Find the root parent id
  const lookup = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id, parent_id FROM estimations WHERE id = @id`);
  const row = lookup.recordset[0];
  if (!row) return false;
  const rootId = row.parent_id || row.id;

  const result = await p.request()
    .input('rootId', sql.UniqueIdentifier, rootId)
    .query(`DELETE FROM estimations WHERE id = @rootId OR parent_id = @rootId`);
  return result.rowsAffected[0] > 0;
}

module.exports = {
  initialize,
  healthCheck,
  countAppUsers,
  getUserRole,
  listAppUsers,
  addAppUser,
  updateAppUserRole,
  deleteAppUser,
  listEstimations,
  listAllEstimations,
  getEstimation,
  getEstimationForAdmin,
  saveEstimation,
  updateEstimation,
  listEstimationVersions,
  deleteEstimation,
  deleteEstimationAsAdmin
};
