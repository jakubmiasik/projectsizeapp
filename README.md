# Fabric Project Sizing

Express app for sizing Microsoft Fabric projects, backed by Azure SQL and fronted by
App Service Easy Auth (Entra ID).

## Running locally

```bash
npm install
npm start
```

## Azure configuration

### SQL

The app connects with `azure-active-directory-default`, so the App Service managed
identity needs to be a user in the target database with read/write rights. No
connection-string secret is stored.

### Microsoft Graph — required for the people pickers

**Share estimation** and **Admin Panel → Manage Access** both search the Entra
directory rather than the app's own user table, so you can only grant access to
someone who actually exists in the tenant.

This requires the App Service managed identity to hold the Graph **application**
permission `User.ReadBasic.All`, with admin consent granted. Until that is done,
both pickers return HTTP 503 with a message naming the missing permission.

To grant it:

```bash
# The managed identity's object id
MI_OID=$(az webapp identity show -g <resource-group> -n <app-name> --query principalId -o tsv)

# Microsoft Graph's service principal in your tenant
GRAPH_SP=$(az ad sp list --filter "appId eq '00000003-0000-0000-c000-000000000000'" --query '[0].id' -o tsv)

# The app-role id for User.ReadBasic.All
ROLE_ID=$(az ad sp show --id "$GRAPH_SP" --query "appRoles[?value=='User.ReadBasic.All'].id | [0]" -o tsv)

az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$MI_OID/appRoleAssignments" \
  --body "{\"principalId\":\"$MI_OID\",\"resourceId\":\"$GRAPH_SP\",\"appRoleId\":\"$ROLE_ID\"}"
```

Granting an application permission to a managed identity is itself an admin
operation, so the assignment above *is* the consent — there is no separate consent
step in the portal.

## Access model

| | Owner | Share recipient | Admin |
|---|---|---|---|
| T-Shirt Sizing | edit | view | edit |
| Project Estimate | edit | view (saves as their own copy) | edit |
| Requirements | edit | edit | edit |
| Cost / rate totals | — | — | view |

Sharing an estimation with someone who has no app access provisions them as an
**Explorer** automatically, so the share is usable the moment they sign in.
