# SQLTools MSSQL/Azure+ Driver

This is a fork of the [Microsoft SQL Server/Azure](https://github.com/mtxr/vscode-sqltools/tree/dev/packages/driver.mssql) Official driver with Windows Authentication support.

*This includes both the tedious driver (part of the Official driver) and the msnodesqlv8 driver, the latter of which introduces **Windows Authentication** support.*

### ⚠️ Module did not self-register error when connecting ⚠️ :
- This happens when you are on an unsupported node/vscode version.
- Install latest [Node LTS version](https://nodejs.org/en)
    - Node versions >= 20 are supported
- Set `sqltools.useNodeRuntime` to `true` in settings.

## Features and Fixes
- Supports msnodesqlv8 driver containing windows authentication support
- Adds DSN connection method
- Fixes Intellisense for databases
- Adds an option to display empty database/schema in side panel
- Adds Security, Functions, Stored procedures, and Linked Servers in side panel
- Supports fetch records functionality for pre SQL Server 2012 databases

## Connection Methods
- Tedious driver
    - Same as the official driver but with optional database input.
    - Supports `trustServerCertificate` boolean setting.
- MSNodeSQLv8 driver
    - Supports Windows Authentication.
    - DSN (Data Source Name) method takes ODBC data source name.
        - If you a `windows authentication` DSN set Use password to `Use empty password`.
        - SQL login/password DSNs require both username and password.

## Screenshots
Side Panel with additional items

![Side Panel](https://raw.githubusercontent.com/fzhem/sqltools-mssql-driver-commver/dev/screenshots/sidepanel.png)

MS Node SQL v8 settings page

![MS Node SQL v8 settings page](https://raw.githubusercontent.com/fzhem/sqltools-mssql-driver-commver/dev/screenshots/msnodesqlv8_settings.png)