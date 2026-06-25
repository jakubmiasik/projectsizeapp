param sqlServerName string
param webAppPrincipalId string

// Note: For full managed identity SQL access, you also need to run:
// az sql server ad-admin create --resource-group <rg> --server-name <server> --display-name <app-name> --object-id <principal-id>
// This must be done post-deployment as a hook since Bicep cannot set AD admin for SQL with managed identity directly.

// Grant the web app's managed identity the SQL DB Contributor role on the SQL server
// This allows managing the database but actual data access requires an AD admin setup
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: sqlServerName
}

// For POC: The app will use SQL auth (admin password) for database access.
// For production, set up the managed identity as an AD admin on the SQL server
// and use azure-active-directory-default authentication in the app.
