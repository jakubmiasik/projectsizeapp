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
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    );

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_estimations_user_oid')
    CREATE INDEX IX_estimations_user_oid ON estimations(user_oid);
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
      SELECT id, client_name, title, created_at, updated_at
      FROM estimations
      WHERE user_oid = @userOid
      ORDER BY updated_at DESC
    `);
  return result.recordset;
}

async function getEstimation(id, userOid) {
  const p = await getPool();
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userOid', sql.NVarChar, userOid)
    .query(`
      SELECT id, client_name, title, data, created_at, updated_at
      FROM estimations
      WHERE id = @id AND user_oid = @userOid
    `);
  const row = result.recordset[0];
  if (!row) return null;
  row.data = JSON.parse(row.data);
  return row;
}

async function saveEstimation({ userOid, userName, clientName, title, data }) {
  const p = await getPool();
  const result = await p.request()
    .input('userOid', sql.NVarChar, userOid)
    .input('userName', sql.NVarChar, userName)
    .input('clientName', sql.NVarChar, clientName)
    .input('title', sql.NVarChar, title)
    .input('data', sql.NVarChar, JSON.stringify(data))
    .query(`
      INSERT INTO estimations (user_oid, user_name, client_name, title, data)
      OUTPUT INSERTED.id
      VALUES (@userOid, @userName, @clientName, @title, @data)
    `);
  return result.recordset[0].id;
}

async function deleteEstimation(id, userOid) {
  const p = await getPool();
  const result = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userOid', sql.NVarChar, userOid)
    .query('DELETE FROM estimations WHERE id = @id AND user_oid = @userOid');
  return result.rowsAffected[0] > 0;
}

module.exports = { initialize, healthCheck, listEstimations, getEstimation, saveEstimation, deleteEstimation };
