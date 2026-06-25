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

module.exports = {
  initialize,
  healthCheck,
  listEstimations,
  getEstimation,
  saveEstimation,
  updateEstimation,
  listEstimationVersions,
  deleteEstimation
};
