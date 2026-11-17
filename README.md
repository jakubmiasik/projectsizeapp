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

### Microsoft Graph — optional, improves the people pickers

**Share estimation** and **Admin Panel → Manage Access** search the Entra
directory, so you can pick a colleague by name instead of typing an address.

This requires the App Service managed identity to hold the Graph **application**
permission `User.ReadBasic.All`, with admin consent granted.

Without the grant the app still works: the pickers fall back to searching the
people the app already knows about (the `app_users` table), and anything typed
that looks like an email address can be granted access directly. Searching by
display name for someone who has never used the app is the only thing you lose.
The fallback is logged server-side and tagged on the response with
`X-User-Search-Source: local`.

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

Sharing never grants application access. An administrator must first add the
recipient as an **Admin** or **Explorer** in **Manage Access**.

Signed-out visitors see the normal landing page with Microsoft sign-in.
After sign-in, all workspace entry points show **Access blocked / Page under
maintenance** to unapproved accounts, with no account-approval explanation or
account actions on that page. Only an explicit `admin`
or `explorer` entry in `app_users` grants workspace/API access. An empty access
list no longer grants Explorer access automatically. On a new installation,
provision the first administrator in `app_users` through your database's
administrative connection.

Workspace pages show a small loading dialog over a blurred, non-interactive
background until authentication and initial data loading finish. The sign-in
landing is shown only after a signed-out response. Access-check failures show
a reload action instead of presenting the login page.

## High-level sizing calibration

Sizing offers the same six project types as Project Estimate. Its questionnaire
groups detailed scope into discovery (including semantic-model assessment),
ingestion, transformation, legacy migration, modelling, reporting, operations
and release environments. Discovery excludes implementation environments.
The two estimates remain independent; choosing a Sizing type does not overwrite
Project Estimate.

In **Admin Panel → Calibration → High-level Sizing recipe**, administrators can:

- Choose included sections for each project type and add custom sections/choices.
- Edit choice descriptions, fixed hours and a percentage of another section's
  base hours. Dependencies must be acyclic; excluded dependencies contribute zero.
- Adjust PM uplift and productive-time percentage used for timeline bands.

The recipe is: round up each choice's fixed hours plus dependency percentage,
apply each section's uplift, sum, apply safety buffer, then add rounded-up PM.
“Not in scope” choices contribute zero by default. Dependencies exclude local
section uplifts to prevent double counting.

**Save defaults** publishes the recipe to Azure SQL alongside detailed calibration
in one transaction. New sizings use those defaults. Saved versions and downloaded
estimation files retain their Sizing recipe and project type, including custom
sections. Older records without a recipe use current defaults. Retire a section
by excluding it from every type rather than changing existing choice indexes.

Icons use a self-hosted subset of Google's **Material Symbols Rounded**; the
Apache-2.0 license is included in `public/fonts/Material-Symbols-LICENSE.txt`.

Run the focused automated checks with `node --test tests/*.test.js`.
For the browser integration check, install `puppeteer-core` in your test
environment, set `PUPPETEER_PATH` to its module directory and `CHROME_PATH` to
Chrome, then run `node tests/sizing-browser.js`. The fixture boots the real
Express app with an in-memory database substitute; it never uses production data.
Run `node tests/loading-browser.js` with the same settings to exercise delayed
authentication, deep-linked estimates, Requirements and loading failure states.
