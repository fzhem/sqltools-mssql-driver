import MSSQLLib, { IResult, Binary } from "mssql";
import * as Queries from "./queries";
import AbstractDriver from "@sqltools/base-driver";
import get from "lodash/get";
import {
  IConnectionDriver,
  NSDatabase,
  ContextValue,
  Arg0,
  IQueryOptions,
  IConnection,
  MConnectionExplorer,
} from "@sqltools/types";
import parse from "./parser";
import { v4 as generateId } from "uuid";
import reservedWordsCompletion from "./reserved-words";
import msnodesqlv8Lib from "msnodesqlv8";

export default class MSSQL
  extends AbstractDriver<any, any>
  implements IConnectionDriver
{
  queries = Queries;

  private retryCount = 0;
  public async open(encryptOverride?: boolean) {
    if (this.connection) {
      return this.connection;
    }

    const { encrypt, trustServerCertificate, ...tediousOptions }: any = this
      .credentials.tediousOptions || {
      encrypt: true,
    };

    let encryptAttempt = typeof encrypt !== "undefined" ? encrypt : true;
    if (typeof encryptOverride !== "undefined") {
      encryptAttempt = encryptOverride;
    }

    if (
      this.credentials.askForPassword &&
      get(tediousOptions, "authentication.type") &&
      get(tediousOptions, "authentication.options.userName")
    ) {
      tediousOptions.authentication.options.password =
        tediousOptions.authentication.options.password ||
        this.credentials.password;
      this.credentials.password = null;
    }

    if (this.credentials.dbDriver === "tedious") {
      const pool = new MSSQLLib.ConnectionPool(
        this.credentials.connectString || {
          database: this.credentials.database,
          connectionTimeout: this.credentials.connectionTimeout * 1000,
          server: this.credentials.server,
          user: this.credentials.username,
          password: this.credentials.password,
          domain: this.credentials.domain || undefined,
          port: this.credentials.port,
          ...tediousOptions,
          options: {
            ...((tediousOptions || {}).options || {}),
            encrypt: encryptAttempt,
            trustServerCertificate: trustServerCertificate,
          },
        }
      );

      await new Promise((resolve, reject) => {
        pool.on("error", reject);
        pool.connect().then(resolve).catch(reject);
      }).catch((e) => {
        // The errors below are relevant to database configuration
        if (
          e.code === "ESOCKET" ||
          e.code === "ELOGIN" ||
          e.code === "EINSTLOOKUP"
        ) {
          throw e;
        }
        if (this.retryCount === 0) {
          this.retryCount++;
          return this.open(!encryptAttempt).catch(() => {
            this.retryCount = 0;
            return Promise.reject(e);
          });
        }
        return Promise.reject(e);
      });

      this.connection = Promise.resolve(pool);
      return this.connection;
    } else {
      if (this.connection) {
        return this.connection;
      }

      this.connection = this.openConnection(this.credentials);
      return this.connection;
    }
  }

  cleanConnectionString(connectionString: string): string {
    return connectionString
      .split(";")
      .filter((part) => {
        const [key, value] = part.split("=");
        // Keep parts where the value is not 'undefined', 'null', or empty
        return !(
          key &&
          ["DATABASE", "UID", "PWD"].includes(key) &&
          (!value || value === "undefined" || value === "null")
        );
      })
      .join(";");
  }

  private async openConnection(
    credentials: IConnection<unknown>
  ): Promise<unknown> {
    let connectionString: string;
    connectionString = `Driver={${credentials.odbcDriver}};Server={${
      credentials.server
    }${
      credentials.port
        ? "," + credentials.port
        : "\\" + credentials.msnodesqlv8Options.instanceName
    }};${
      credentials.database ? `;Database=${credentials.database}` : ""
    };Trusted_Connection=yes`;
    if (credentials.connectionMethod === "DSN") {
      connectionString = `DSN=${credentials.dsnName};UID=${credentials.username};PWD=${credentials.password}`;
      connectionString = this.cleanConnectionString(connectionString);
    }
    return new Promise((resolve, reject) => {
      msnodesqlv8Lib.open(connectionString, (err, conn) => {
        if (err) {
          reject(err);
          throw err;
        } else {
          resolve(conn);
        }
      });
    });
  }

  public async close() {
    if (this.credentials.dbDriver === "tedious") {
      if (!this.connection) return Promise.resolve();

      const pool = await this.connection;
      await pool.close();
      this.connection = null;
    } else {
      if (!this.connection) {
        return;
      }

      const conn = await this.connection;
      conn.close();
      this.connection = null;
    }
  }

  public query: (typeof AbstractDriver)["prototype"]["query"] = async (
    originalQuery,
    opt = {}
  ) => {
    if (this.credentials.dbDriver === "tedious") {
      const pool = await this.open();
      const { requestId } = opt;
      const request = pool.request();
      request.multiple = true;
      const query = originalQuery
        .toString()
        .replace(/^[ \t]*GO;?[ \t]*$/gim, "");
      const {
        recordsets = [],
        rowsAffected,
        error,
      } = <IResult<any> & { error: any }>(
        await request
          .query(query)
          .catch((error) =>
            Promise.resolve({ error, recordsets: [], rowsAffected: [] })
          )
      );
      const queries = parse(query, "mssql");
      return queries.map((q, i): NSDatabase.IResult => {
        const r = recordsets[i] || [];
        const columnNames = [];
        const bufferCols = [];
        Object.values((<any>r).columns || []).forEach((col: any) => {
          columnNames.push(col.name);
          if (col && col.type && col.type.name === Binary.name) {
            bufferCols.push(col.name);
          }
        });
        const messages = [];
        if (error) {
          messages.push(this.prepareMessage(error.message || error.toString()));
        }
        if (typeof rowsAffected[i] === "number")
          messages.push(
            this.prepareMessage(`${rowsAffected[i]} rows were affected.`)
          );

        return {
          requestId,
          resultId: generateId(),
          connId: this.getId(),
          cols: columnNames,
          messages,
          error,
          query: q,
          results: Array.isArray(r)
            ? r.map((row) => {
                bufferCols.forEach((c) => {
                  try {
                    row[c] = `0x${Buffer.from(row[c])
                      .toString("hex")
                      .toUpperCase()}`;
                  } catch (_ee) {}
                });
                return row;
              })
            : [],
        };
      });
    } else {
      {
        const conn = (await this.connection) || (await this.open());
        const queryString = originalQuery
          .toString()
          .replace(/^[ \t]*GO;?[ \t]*$/gim, "");
        try {
          const queryResults = await this.executeQuery(conn, queryString);

          const cols =
            queryResults.length > 0 ? Object.keys(queryResults[0]) : [];

          return [
            {
              requestId: opt.requestId,
              resultId: generateId(),
              connId: this.getId(),
              cols,
              messages: [
                {
                  date: new Date(),
                  message: `Query ok with ${queryResults.length} results`,
                },
              ],
              queryString,
              results: queryResults,
            },
          ];
        } catch (error) {
          const rawMessage = (error as any).message || error + "";

          return [
            {
              requestId: opt.requestId,
              connId: this.getId(),
              resultId: generateId(),
              cols: [],
              messages: [rawMessage],
              error: true,
              rawError: rawMessage,
              queryString,
              results: [],
            },
          ];
        }
      }
    }
  };

  private async executeQuery(conn, query: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      conn.query(query, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  public checkDBAccess(database: string) {
    return new Promise((resolve) => {
      this.query(
        `SELECT TOP 1 1 FROM ${database}.INFORMATION_SCHEMA.TABLES`,
        {}
      ).then((result) => {
        if (result[0].error) {
          // EREQUEST error comes from mssql
          if (result[0].error.code === "EREQUEST" || result[0].error === true) {
            resolve(false);
          }
        } else {
          resolve(true);
        }
      });
    });
  }

  public async findAccessibleDatabases(databases: NSDatabase.IDatabase[]) {
    const accessibleDatabases = [];
    const promises = [];

    for (const db of databases) {
      if (db.type === ContextValue.DATABASE) {
        const accessPromise = this.checkDBAccess(db.database);
        promises.push(
          accessPromise.then((access) => {
            if (access) {
              accessibleDatabases.push(db);
            }
          })
        );
      }
    }

    return Promise.all(promises)
      .then(() => {
        return accessibleDatabases;
      })
      .catch((error) => {
        throw error;
      });
  }

  public async getChildrenForItem({
    item,
    parent,
  }: Arg0<IConnectionDriver["getChildrenForItem"]>) {
    switch (item.type) {
      case ContextValue.CONNECTION:
      case ContextValue.CONNECTED_CONNECTION:
        let result = await this.queryResults(this.queries.fetchDatabases());
        const contextRoot = [
          {
            label: "Security",
            database: "Security",
            type: "connection.security",
            detail: "security",
            iconId: "shield",
          },
          {
            label: "Functions",
            database: "Functions",
            type: ContextValue.FUNCTION,
            detail: "functions",
            iconId: "code",
          },
          {
            label: "Stored Procedures",
            database: "Procedures",
            type: "connection.storedProceduresRoot",
            detail: "procedures",
            iconId: "variable-group",
          },
          {
            label: "Linked Servers",
            database: "Linked Servers",
            type: "connection.linkedServersRoot",
            detail: "linkedservers",
            iconId: "link",
          },
        ];
        result = [...result, ...contextRoot];
        if (!this.credentials.sidePanelOptions.inaccessibleDatabase) {
          return this.findAccessibleDatabases(result).then(
            (accessibleDatabases) => {
              accessibleDatabases = [...accessibleDatabases, ...contextRoot];
              return accessibleDatabases;
            }
          );
        }
        return result;
      case "connection.security":
        return <MConnectionExplorer.IChildItem[]>(<unknown>[
          {
            label: "Users",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "smiley",
            childType: "connection.users",
          },
          {
            label: "Roles",
            type: "connection.roles",
            iconId: "organization",
            childType: ContextValue.RESOURCE_GROUP,
          },
        ]);
      case "connection.roles":
        return <MConnectionExplorer.IChildItem[]>(<unknown>[
          {
            label: "Database Roles",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.dbRoles",
          },
          {
            label: "Application Roles",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.appRoles",
          },
        ]);
      case ContextValue.TABLE:
      case ContextValue.VIEW:
        return this.getColumns(item as NSDatabase.ITable);
      case ContextValue.DATABASE:
        return <MConnectionExplorer.IChildItem[]>[
          {
            label: "Schemas",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: ContextValue.SCHEMA,
          },
          {
            label: "Synonyms",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.synonyms",
          },
        ];
      case ContextValue.RESOURCE_GROUP:
        return this.getChildrenForGroup({ item, parent });
      case ContextValue.SCHEMA:
        return <MConnectionExplorer.IChildItem[]>[
          {
            label: "Tables",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: ContextValue.TABLE,
          },
          {
            label: "Views",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: ContextValue.VIEW,
          },
        ];
      case ContextValue.FUNCTION:
        return <MConnectionExplorer.IChildItem[]>(<unknown>[
          {
            label: "Table-valued Functions",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.tableValuedFunctions",
          },
          {
            label: "Scalar-valued Functions",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.scalarFunctions",
          },
          {
            label: "Aggregate Functions",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.aggFunctions",
          },
        ]);
      case "connection.tableValuedFunctions":
      case "connection.scalarFunctions":
      case "connection.aggFunctions":
      case "connection.storedProcedures":
        return this.queryResults(this.queries.fetchParameters(item));
      case "connection.storedProceduresRoot":
        return this.queryResults(this.queries.fetchStoredProcedures());
      case "connection.linkedServersRoot":
        try {
          const result = await this.queryResults(
            this.queries.fetchLinkedServers()
          );
          return result;
        } catch (error) {
          this.close();
          return [];
        }
      case "connection.linkedServers":
        try {
          const result = await this.queryResults(
            this.queries.fetchLinkedServerCatalogs(item)
          );
          const transformedResult = result.map((out) => ({
            label: out.CATALOG_NAME,
            database: out.CATALOG_NAME,
            type: ContextValue.DATABASE,
            detail: "database",
            linkedserver: item.linkedserver,
          }));
          return transformedResult;
        } catch (error) {
          console.log(
            "Error while fetching linked servers:",
            error,
            "\n----Using a fallback method----"
          );
          try {
            const result = await this.queryResults(
              this.queries.fetchLinkedServerDatabaseAndSchemas(item)
            );
            const distinctValues = Array.from(
              new Set(
                result.map((item) => `${item.TABLE_CAT}:${item.TABLE_SCHEM}`)
              )
            ).map((item) => {
              const [TABLE_CAT, TABLE_SCHEM] = item.split(":");
              return { TABLE_CAT, TABLE_SCHEM };
            });
            const fallbackDatabases = distinctValues.map((out) => ({
              label: out.TABLE_CAT,
              database: out.TABLE_CAT,
              schema: out.TABLE_SCHEM,
              type: "connection.fallbackDatabase",
              detail: "database",
              linkedserver: item.linkedserver,
              iconId: "database",
            }));
            const fallbackSchemas = distinctValues.map((out) => ({
              label: out.TABLE_SCHEM,
              database: out.TABLE_CAT,
              schema: out.TABLE_SCHEM,
              type: "connection.fallbackSchema",
              detail: "schema",
              linkedserver: item.linkedserver,
              iconId: "group-by-ref-type",
            }));
            if (!result.every((row) => row.TABLE_CAT === null)) {
              return fallbackDatabases;
            } else {
              return fallbackSchemas;
            }
          } catch (error) {
            console.error("Error in fallback method:", error);
            this.close();
            return [];
          }
        }
      case "connection.fallbackDatabase":
        try {
          const result = await this.queryResults(
            this.queries.fetchLinkedServerSchemas(item)
          );
          const distinctSchem = [
            ...new Set(result.map((row) => row.TABLE_SCHEM)),
          ];
          const distinctSchemObjects = distinctSchem.map((schem) => ({
            TABLE_SCHEM: schem,
          }));
          const fallbackSchemas = distinctSchemObjects.map((out) => ({
            label: out.TABLE_SCHEM,
            database: item.database,
            schema: out.TABLE_SCHEM,
            type: "connection.fallbackSchema",
            detail: "schema",
            linkedserver: item.linkedserver,
            iconId: "group-by-ref-type",
          }));
          return fallbackSchemas;
        } catch (error) {
          this.close();
          return [];
        }
      case "connection.fallbackSchema":
        return [
          {
            label: "Tables",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.fallbackTable",
          },
          {
            label: "Views",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: "connection.fallbackView",
          },
        ];
      case "connection.fallbackTable":
      case "connection.fallbackView":
        let fallbackColumnResult = await this.queryResults(
          this.queries.fetchLinkedServerColumns(item)
        );
        fallbackColumnResult = fallbackColumnResult.filter(
          (column) =>
            column.TYPE_NAME !== "INTERVAL YEAR TO MONTH" &&
            column.TYPE_NAME !== "INTERVAL DAY TO SECOND"
        );
        const transformedColumns = fallbackColumnResult.map((column) => {
          const detail = column.CHAR_OCTET_LENGTH
            ? `${column.TYPE_NAME}(${column.CHAR_OCTET_LENGTH})`
            : column.TYPE_NAME;

          return {
            label: column.COLUMN_NAME,
            type: "connection.fallbackColumn",
            table: column.TABLE_NAME,
            dataType: column.TYPE_NAME,
            detail: detail,
            database: column.TABLE_CAT,
            schema: column.TABLE_SCHEM,
            isNullable: column.IS_NULLABLE,
            iconId: "symbol-field",
            childType: ContextValue.NO_CHILD,
          };
        });

        return transformedColumns;
    }
    return [];
  }

  public compareVersions(currentVersion: string, targetVersion: string) {
    const current = currentVersion.split(".").map(Number);
    const target = targetVersion.split(".").map(Number);

    for (let i = 0; i < current.length; i++) {
      if (current[i] > target[i]) {
        return true;
      } else if (current[i] < target[i]) {
        return false;
      }
    }
    return true;
  }

  public async showRecords(
    table: NSDatabase.ITable,
    opt: IQueryOptions & { limit: number; page?: number }
  ) {
    const sqlServerVersionQuery = table.linkedserver
      ? await this.query(
          `SELECT * FROM OPENQUERY(${table.linkedserver}, 'SELECT SERVERPROPERTY(''productversion'') AS Version')`,
          {}
        )
      : await this.query(
          "SELECT SERVERPROPERTY('ProductVersion') AS Version",
          {}
        );
    const sqlServerVersion = sqlServerVersionQuery[0].results[0].Version;
    // SQL Server 2012 added support for OFFSET
    if (this.compareVersions(sqlServerVersion, "11.0.1103.9")) {
      return super.showRecords(table, opt);
    }
    const { limit, page = 0 } = opt;
    const params = { ...opt, limit, table, offset: page * limit };
    return this.query(this.queries.fetchRecordsWithoutOffset(params), opt);
  }

  private async getChildrenForGroup({
    parent,
    item,
  }: Arg0<IConnectionDriver["getChildrenForItem"]>) {
    switch (item.childType) {
      case ContextValue.SCHEMA:
        if (this.credentials.sidePanelOptions.inaccessibleSchema) {
          try {
            const result = await this.queryResults(
              this.queries.fetchSchemas(parent)
            );
            return result;
          } catch (error) {
            this.close();
            return [];
          }
        } else {
          try {
            const result = await this.queryResults(
              this.queries.fetchSchemasExcludingEmpty(parent)
            );
            return result;
          } catch (error) {
            this.close();
            return [];
          }
        }
      case ContextValue.TABLE:
        return this.queryResults(
          this.queries.fetchTables(parent as NSDatabase.ISchema)
        );
      case ContextValue.VIEW:
        return this.queryResults(
          this.queries.fetchViews(parent as NSDatabase.ISchema)
        );
      case "connection.scalarFunctions":
        return this.queryResults(this.queries.fetchScalarFunctions());
      case "connection.tableValuedFunctions":
        return await this.queryResults(
          this.queries.fetchTableValuedFunctions()
        );
      case "connection.aggFunctions":
        return await this.queryResults(this.queries.fetchAggregateFunctions());
      case "connection.synonyms":
        try {
          const resultsSynonyms = await this.queryResults(
            this.queries.fetchSynonyms(parent as NSDatabase.ISchema)
          );
          return resultsSynonyms.map((col) => ({
            ...col,
            childType: ContextValue.NO_CHILD,
          }));
        } catch (error) {
          this.close();
          return [];
        }
      case "connection.users":
        const resultsUsers = await this.queryResults(this.queries.fetchUsers());
        return resultsUsers.map((col) => ({
          ...col,
          childType: ContextValue.NO_CHILD,
        }));
      case "connection.dbRoles":
        const resultsDatabaseRoles = await this.queryResults(
          this.queries.fetchDatabaseRoles()
        );
        return resultsDatabaseRoles.map((col) => ({
          ...col,
          childType: ContextValue.NO_CHILD,
        }));
      case "connection.fallbackTable":
        const resultsFallbackTables = await this.queryResults(
          this.queries.fetchLinkedServerTables(parent)
        );
        const transformedResultsFallbackTables = resultsFallbackTables.map(
          (out) => ({
            label: out.TABLE_NAME,
            database: out.TABLE_CAT,
            schema: out.TABLE_SCHEM,
            type: "connection.fallbackTable",
            isView: 0,
            linkedserver: parent.linkedserver,
            iconName: "table",
          })
        );
        return transformedResultsFallbackTables;
      case "connection.fallbackView":
        const resultsFallbackViews = await this.queryResults(
          this.queries.fetchLinkedServerViews(parent)
        );
        const transformedResultsFallbackViews = resultsFallbackViews.map(
          (out) => ({
            label: out.TABLE_NAME,
            database: out.TABLE_CAT,
            schema: out.TABLE_SCHEM,
            type: "connection.fallbackView",
            isView: 1,
            linkedserver: parent.linkedserver,
            iconName: "view",
          })
        );
        return transformedResultsFallbackViews;
    }
    return [];
  }

  private async getColumns(
    parent: NSDatabase.ITable
  ): Promise<NSDatabase.IColumn[]> {
    const results = await this.queryResults(this.queries.fetchColumns(parent));
    return results.map((col) => ({
      ...col,
      iconName: col.isPk ? "pk" : col.isFk ? "fk" : null,
      childType: ContextValue.NO_CHILD,
      table: parent,
    }));
  }

  public async searchItems(
    itemType: ContextValue,
    search: string,
    extraParams: any = {}
  ): Promise<NSDatabase.SearchableItem[]> {
    switch (itemType) {
      case ContextValue.DATABASE:
        return this.queryResults(this.queries.searchDatabases({ search }));
      case ContextValue.TABLE:
        return this.queryResults(
          this.queries.searchTables({ search, ...extraParams })
        );
      case ContextValue.COLUMN:
        return this.queryResults(
          this.queries.searchColumns({ search, ...extraParams })
        );
    }
  }

  public getStaticCompletions = async () => {
    return reservedWordsCompletion;
  };
}
