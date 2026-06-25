targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment')
param environmentName string

@minLength(1)
@description('Azure region for all resources')
param location string

@description('SQL admin password')
@secure()
param sqlAdminPassword string

var tags = { 'azd-env-name': environmentName }
var resourceSuffix = take(uniqueString(subscription().id, environmentName, location), 6)
var rgName = 'rg-${environmentName}'

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: rgName
  location: location
  tags: tags
}

module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceSuffix: resourceSuffix
  }
}

module sql './modules/sql.bicep' = {
  name: 'sql'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceSuffix: resourceSuffix
    sqlAdminPassword: sqlAdminPassword
  }
}

module web './modules/web.bicep' = {
  name: 'web'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceSuffix: resourceSuffix
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    sqlServerFqdn: sql.outputs.sqlServerFqdn
    sqlDatabaseName: sql.outputs.sqlDatabaseName
  }
}

// Grant the web app managed identity access to SQL
module sqlRbac './modules/sql-rbac.bicep' = {
  name: 'sql-rbac'
  scope: rg
  params: {
    sqlServerName: sql.outputs.sqlServerName
    webAppPrincipalId: web.outputs.webAppPrincipalId
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output WEB_URL string = web.outputs.webAppUrl
output SQL_SERVER string = sql.outputs.sqlServerFqdn
output SQL_DATABASE string = sql.outputs.sqlDatabaseName
