import MSSQLLib, { IResult, Binary } from "mssql";
import * as Queries from "./queries";
import AbstractDriver from "@sqltools/base-driver";
import get from "lodash/get";
import {
  IConnectionDriver,
  NSDatabase,
  ContextValue,
  Arg0,
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
      connectionString = `DSN=${credentials.dsnName};UID=${credentials.username};PWD=${credentials.password}`
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
            type: "connection.linkedServers",
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
          // { label: 'Functions', type: ContextValue.RESOURCE_GROUP, iconId: 'folder', childType: ContextValue.FUNCTION },
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
      case "connection.linkedServers":
        try {
          const result = await this.queryResults(
            this.queries.fetchLinkedServers()
          );
          return result;
        } catch (error) {
          this.close();
          return [];
        }
    }
    return [];
  }

  public showRecords(table, opt) {
    return this.searchItems(ContextValue.COLUMN, "", {
      tables: [table],
      limit: 1,
    }).then((col) => {
      opt.orderCol = col[0].label;
      return super.showRecords(table, opt);
    });
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
