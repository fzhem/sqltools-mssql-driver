# SQLTools MSSQL/Azure+ Driver

This is a fork of the [Microsoft SQL Server/Azure](https://github.com/mtxr/vscode-sqltools/tree/dev/packages/driver.mssql) Official driver with Windows Authentication support.

*This includes both the tedious driver (part of the Official driver) and the msnodesqlv8 driver, the latter of which introduces **Windows Authentication** support.*

## How to activate?
1. Install [Node.js v20](https://nodejs.org/en)
2. Set `sqltools.useNodeRuntime` to `true` in settings.

### ⚠️ Module did not self-register error when connecting ⚠️ :
- This happens when you are using a different Node version from `How to activate?` step 1.
- (IMPORTANT!) Close VSCode
- Go to your extension directory
    - Windows: `%USERPROFILE%\.vscode\extensions\fzhem.sqltools-driver-mssql-commver-0.5.6`
    - Linux: `~/.vscode/extensions/fzhem.sqltools-driver-mssql-commver-0.5.6`
    - Mac OS: `~/.vscode/extensions/fzhem.sqltools-driver-mssql-commver-0.5.6`
- Run `npm install msnodesqlv8@4.2.1` in your terminal.
    - Alternatively you can run `npm rebuild` but that may require additional libraries.

## Connection Methods
- Tedious driver
    - Fork of the official driver with optional database input.
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


## Changelog

### 0.5.6
- Add DSN connection method in mssqlnodev8 driver
- Fix missing connection string option in tedious driver
- Make database input optional in tedious driver
- Upgrade mssql -> 11.0.1

### 0.5.5
- Add Security, Functions, Stored procedures, and Linked Servers to side panel
- Use msnodesqlv8 directly effectively fixing [#2](https://github.com/fzhem/sqltools-mssql-driver-commver/issues/2)

### 0.5.4
- Update activation instructions and add `Module did not self-register error solution`.

### 0.5.3
- Add option to display empty databases in side panel.
- Use MS recommended sys table to get a list of databases. This potentially fixes [vscode-sqltools/issues#710](https://github.com/mtxr/vscode-sqltools/issues/710)

### 0.5.2
- Throw error for database misconfiguration rather than retrying connection. You will now see an error rather than successfully connected when credentials or config is wrong. 

### 0.5.1
- Resolved GetChildrenForTreeItemRequest failed error when user accesses inaccessible schema. 
- Add option to display empty schema in side panel.

### 0.5.0
- Add msnodesqlv8 driver
    - This adds Integrated (windows auth) as a connection method.
- Add trustServerCertificate option in tedious driver.
- Intellisense for databases.
- Set default connection timeout to be the same as the tedious driver (15000 ms)
- Note: msnodesqlv8 is only available on 64-bit versions of linux, windows, and macos. Hence this extension only works on these platforms. 

### 0.4.3

- Use NodeJS 16.

### 0.4.2

- Support password storage using SQLTools Driver Credentials service. [#1175](https://github.com/mtxr/vscode-sqltools/pull/1175) - thanks [@raulcesar](https://github.com/raulcesar)
- List schemas in alphabetical order. [#1176](https://github.com/mtxr/vscode-sqltools/issues/1176) - thanks [@bombillazo](https://github.com/bombillazo)

### 0.4.1

- Avoid storing redundant properties on connections that use `connectString`. [#1087](https://github.com/mtxr/vscode-sqltools/issues/1087)

### 0.4.0

- Sync with 0.27 release of main extension.

### 0.3.0

- Sync with 0.24 release of main extension.

### 0.2.0

- Update `base-driver` package.

### 0.1.0

- Sync official driver versions and technology

### 0.0.6

- Connection assistant not showing options. [#619](https://github.com/mtxr/vscode-sqltools/issues/619)
- Removed preview flag

### 0.0.4

- Fixes drivers not showing data type on explorer. [#595](https://github.com/mtxr/vscode-sqltools/issues/595)

### 0.0.3

- First working version
