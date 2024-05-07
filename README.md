# SQLTools MSSQL/Azure+ Driver

This is a fork of the [Microsoft SQL Server/Azure](https://github.com/mtxr/vscode-sqltools/tree/dev/packages/driver.mssql) Official driver with Windows Authentication support.

## How to activate?
- Install [Node.js](https://nodejs.org/en)
- Set `sqltools.useNodeRuntime` to `true` in settings.

## Screenshots
MS Node SQL v8 settings page

![MS Node SQL v8 settings page](https://raw.githubusercontent.com/fzhem/sqltools-mssql-driver-commver/dev/screenshots/msnodesqlv8_settings.png)

## Changelog

### 0.5.0
- Add msnodesqlv8 driver
    - This adds Integrated (windows auth) as a connection method.
- Add trustServerCertificate option in tedious driver.
- Intellisense and sidepanel now works when you have multiple databases (check queries.ts).
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
