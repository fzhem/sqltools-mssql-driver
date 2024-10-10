import queryFactory from '@sqltools/base-driver/dist/lib/factory';
import { IBaseQueries, ContextValue, NSDatabase } from '@sqltools/types';

export function escapeTableName(table: Partial<NSDatabase.ITable> | string) {
  let items: string[] = [];
  let tableObj = typeof table === 'string' ? <NSDatabase.ITable>{ label: table } : table;
  tableObj.linkedserver && items.push(`[${tableObj.linkedserver}]`);
  tableObj.database && items.push(`[${tableObj.database}]`);
  tableObj.schema && items.push(`[${tableObj.schema}]`);
  items.push(`[${tableObj.label}]`);
  return items.join('.');
}

export const describeTable: IBaseQueries['describeTable'] = queryFactory`
SP_COLUMNS @table_name = [${p => p.label}],
  @table_owner = [${p => p.schema}],
  @table_qualifier = [${p => p.database}]
`;
export const fetchColumns: IBaseQueries['fetchColumns'] = queryFactory`
SELECT
  C.COLUMN_NAME AS label,
  '${ContextValue.COLUMN}' as "type",
  C.TABLE_NAME AS "table",
  C.DATA_TYPE AS "dataType",
  UPPER(C.DATA_TYPE + (
    CASE WHEN C.CHARACTER_MAXIMUM_LENGTH > 0 THEN (
      '(' + CONVERT(VARCHAR, C.CHARACTER_MAXIMUM_LENGTH) + ')'
    ) ELSE '' END
  )) AS "detail",
  C.CHARACTER_MAXIMUM_LENGTH AS size,
  C.TABLE_CATALOG AS "database",
  C.TABLE_SCHEMA AS "schema",
  C.COLUMN_DEFAULT AS "defaultValue",
  C.IS_NULLABLE AS "isNullable",
  (CASE WHEN LOWER(TC.CONSTRAINT_TYPE) = 'primary key' THEN 1 ELSE 0 END) as "isPk",
  (CASE WHEN LOWER(TC.CONSTRAINT_TYPE) = 'foreign key' THEN 1 ELSE 0 END) as "isFk"
FROM ${p => p.linkedserver
  ? `[${p.linkedserver}].[${p.database}].INFORMATION_SCHEMA.COLUMNS` 
  : (p.database 
      ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "COLUMNS" })}` 
      : 'INFORMATION_SCHEMA.COLUMNS')} C
  LEFT JOIN ${p => p.linkedserver
    ? `[${p.linkedserver}].[${p.database}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE` 
    : (p.database 
        ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "KEY_COLUMN_USAGE" })}` 
        : 'INFORMATION_SCHEMA.KEY_COLUMN_USAGE')} AS KCU ON (
    C.TABLE_CATALOG = KCU.TABLE_CATALOG
    AND C.TABLE_NAME = KCU.TABLE_NAME
    AND C.TABLE_SCHEMA = KCU.TABLE_SCHEMA
    AND C.TABLE_CATALOG = KCU.TABLE_CATALOG
    AND C.COLUMN_NAME = KCU.COLUMN_NAME
  )
  LEFT JOIN ${p => p.linkedserver
  ? `[${p.linkedserver}].[${p.database}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS` 
  : (p.database 
      ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "TABLE_CONSTRAINTS" })}` 
      : 'INFORMATION_SCHEMA.TABLE_CONSTRAINTS')} AS TC ON (
    TC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME
    AND TC.TABLE_SCHEMA = KCU.TABLE_SCHEMA
    AND TC.TABLE_CATALOG = KCU.TABLE_CATALOG
  )
  JOIN ${p => p.linkedserver
    ? `[${p.linkedserver}].[${p.database}].INFORMATION_SCHEMA.TABLES` 
    : (p.database 
        ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "TABLES" })}` 
        : 'INFORMATION_SCHEMA.TABLES')} AS T ON C.TABLE_NAME = T.TABLE_NAME
  AND C.TABLE_SCHEMA = T.TABLE_SCHEMA
  AND C.TABLE_CATALOG = T.TABLE_CATALOG
WHERE
  C.TABLE_SCHEMA = '${p => p.schema}'
  AND C.TABLE_NAME = '${p => p.label}'
  AND C.TABLE_CATALOG = '${p => p.database}'
ORDER BY
  C.TABLE_NAME,
  C.ORDINAL_POSITION
`;

export const fetchRecords: IBaseQueries['fetchRecords'] = queryFactory`
SELECT *
FROM ${p => escapeTableName(p.table)}
ORDER BY 1 ASC
OFFSET ${p => p.offset || 0} ROWS
FETCH NEXT ${p => p.limit || 50} ROWS ONLY
`;

export const fetchRecordsWithoutOffset: IBaseQueries['fetchRecords'] = queryFactory`
SELECT *
FROM ${p => escapeTableName(p.table)}
ORDER BY 1 ASC
`;

export const countRecords: IBaseQueries['countRecords'] = queryFactory`
SELECT COUNT(1) AS total
FROM ${p => escapeTableName(p.table)}
`;

const fetchTablesAndViews = (type: ContextValue, tableType = 'BASE TABLE'): IBaseQueries['fetchTables'] => queryFactory`
SELECT
  T.TABLE_NAME AS label,
  '${type}' as "type",
  T.TABLE_SCHEMA AS "schema",
  T.TABLE_CATALOG AS "database",
  CONVERT(BIT, CASE WHEN T.TABLE_TYPE = 'BASE TABLE' THEN 0 ELSE 1 END) AS "isView",
  ${p => p.linkedserver ? `'${p.linkedserver}'` : 'NULL'} AS linkedserver
FROM ${p => p.linkedserver
  ? `[${p.linkedserver}].[${p.database}].INFORMATION_SCHEMA.TABLES` 
  : (p.database 
      ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "TABLES" })}` 
      : 'INFORMATION_SCHEMA.TABLES')} AS T

WHERE
  T.TABLE_SCHEMA = '${p => p.schema}'
  AND T.TABLE_CATALOG = '${p => p.database}'
  AND T.TABLE_TYPE = '${tableType}'
ORDER BY
  T.TABLE_NAME;
`;

export const fetchTables: IBaseQueries['fetchTables'] = fetchTablesAndViews(ContextValue.TABLE);
export const fetchViews: IBaseQueries['fetchTables'] = fetchTablesAndViews(ContextValue.VIEW, 'VIEW');

export const fetchSchemas: IBaseQueries['fetchSchemas'] = queryFactory`
SELECT
  schema_name AS label,
  schema_name AS "schema",
  '${ContextValue.SCHEMA}' as "type",
  'group-by-ref-type' as "iconId",
  catalog_name as "database",
  ${p => p.linkedserver ? `'${p.linkedserver}'` : 'NULL'} AS linkedserver
FROM ${p => p.linkedserver 
  ? `[${p.linkedserver}].[${p.database}].information_schema.schemata` 
  : (p.database 
      ? `${escapeTableName({ database: p.database, schema: "information_schema", label: "schemata" })}` 
      : 'information_schema.schemata')}
WHERE
  LOWER(schema_name) NOT IN ('information_schema', 'sys', 'guest')
  AND LOWER(schema_name) NOT LIKE 'db\\_%' ESCAPE '\\'
  AND catalog_name = '${p => p.database}'
ORDER BY
  schema_name;
`;

export const fetchSchemasExcludingEmpty: IBaseQueries['fetchSchemas'] = queryFactory`
SELECT DISTINCT
  T.TABLE_SCHEMA AS label,
  T.TABLE_SCHEMA AS "schema",
  '${ContextValue.SCHEMA}' as "type",
  'group-by-ref-type' as "iconId",
  '${p => p.database}' as "database",
  ${p => p.linkedserver ? `'${p.linkedserver}'` : 'NULL'} AS linkedserver
FROM ${p => p.linkedserver
  ? `[${p.linkedserver}].[${p.database}].INFORMATION_SCHEMA.TABLES` 
  : (p.database 
      ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "TABLES" })}` 
      : 'INFORMATION_SCHEMA.TABLES')} AS T
WHERE
  T.TABLE_CATALOG = '${p => p.database}'
  AND LOWER(T.TABLE_SCHEMA) NOT LIKE 'db\\_%' ESCAPE '\\'
ORDER BY T.TABLE_SCHEMA
`;

export const fetchDatabases: IBaseQueries['fetchDatabases'] = queryFactory`
SELECT name AS label,
  name AS "database",
  '${ContextValue.DATABASE}' AS "type",
  'database' AS "detail"
FROM sys.databases
WHERE name NOT IN ('master', 'model', 'msdb', 'tempdb')
ORDER BY label
`;

export const searchDatabases: IBaseQueries['searchTables'] = queryFactory`
SELECT name AS label,
  name AS "database",
  '${ContextValue.DATABASE}' AS "type",
  'database' AS "detail"
FROM sys.databases
WHERE name NOT IN ('master', 'model', 'msdb', 'tempdb')
${p => p.search ? `AND LOWER(name) LIKE '%${p.search.toLowerCase()}%'` : ''}
ORDER BY name
`;

export const searchTables: IBaseQueries['searchTables'] = queryFactory`
SELECT
  T.TABLE_NAME AS label,
  (CASE WHEN T.TABLE_TYPE = 'BASE TABLE' THEN '${ContextValue.TABLE}' ELSE '${ContextValue.VIEW}' END) as type,
  T.TABLE_SCHEMA AS "schema",
  T.TABLE_CATALOG AS "database",
  (CASE WHEN T.TABLE_TYPE = 'BASE TABLE' THEN 0 ELSE 1 END) AS "isView",
  (CASE WHEN T.TABLE_TYPE = 'BASE TABLE' THEN 'table' ELSE 'view' END) AS description,
  ('[' + T.TABLE_CATALOG + '].[' + T.TABLE_SCHEMA + '].[' + T.TABLE_NAME + ']') as detail
FROM ${p => p.database ? `${escapeTableName({ database: p.database, schema: "INFORMATION_SCHEMA", label: "TABLES" })}` : 'INFORMATION_SCHEMA.TABLES'} AS T
WHERE
  LOWER(T.TABLE_SCHEMA) NOT IN ('information_schema', 'sys', 'guest')
  AND LOWER(T.TABLE_SCHEMA) NOT LIKE 'db\\_%' ESCAPE '\\'
  ${p => p.search ? `AND (
    LOWER(T.TABLE_CATALOG + '.' + T.TABLE_SCHEMA + '.' + T.TABLE_NAME) LIKE '%${p.search.toLowerCase()}%'
    OR LOWER('[' + T.TABLE_CATALOG + '].[' + T.TABLE_SCHEMA + '].[' + T.TABLE_NAME + ']') LIKE '%${p.search.toLowerCase()}%'
    OR LOWER(T.TABLE_NAME) LIKE '%${p.search}%'
  )` : ''}
ORDER BY
  T.TABLE_NAME
OFFSET 0 ROWS
FETCH NEXT ${p => p.limit || 100} ROWS ONLY
`;

export const searchColumns: IBaseQueries['searchColumns'] = queryFactory`
SELECT
  C.COLUMN_NAME AS label,
  '${ContextValue.COLUMN}' as "type",
  C.TABLE_NAME AS "table",
  C.DATA_TYPE AS "dataType",
  C.CHARACTER_MAXIMUM_LENGTH AS size,
  C.TABLE_CATALOG AS "database",
  C.TABLE_SCHEMA AS "schema",
  C.COLUMN_DEFAULT AS "defaultValue",
  C.IS_NULLABLE AS "isNullable",
  (CASE WHEN LOWER(TC.CONSTRAINT_TYPE) = 'primary key' THEN 1 ELSE 0 END) as "isPk",
  (CASE WHEN LOWER(TC.CONSTRAINT_TYPE) = 'foreign key' THEN 1 ELSE 0 END) as "isFk"
FROM
  ${p => p.tables[0].database ? `${escapeTableName({ database: p.tables[0].database, schema: "INFORMATION_SCHEMA", label: "COLUMNS" })}` : 'INFORMATION_SCHEMA.COLUMNS'} C
  LEFT JOIN ${p => p.tables[0].database ? `${escapeTableName({ database: p.tables[0].database, schema: "INFORMATION_SCHEMA", label: "KEY_COLUMN_USAGE" })}` : 'INFORMATION_SCHEMA.KEY_COLUMN_USAGE'} AS KCU ON (
    C.TABLE_CATALOG = KCU.TABLE_CATALOG
    AND C.TABLE_NAME = KCU.TABLE_NAME
    AND C.TABLE_SCHEMA = KCU.TABLE_SCHEMA
    AND C.TABLE_CATALOG = KCU.TABLE_CATALOG
    AND C.COLUMN_NAME = KCU.COLUMN_NAME
  )
  LEFT JOIN ${p => p.tables[0].database ? `${escapeTableName({ database: p.tables[0].database, schema: "INFORMATION_SCHEMA", label: "TABLE_CONSTRAINTS" })}` : 'INFORMATION_SCHEMA.TABLE_CONSTRAINTS'} AS TC ON (
    TC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME
    AND TC.TABLE_SCHEMA = KCU.TABLE_SCHEMA
    AND TC.TABLE_CATALOG = KCU.TABLE_CATALOG
  )
  JOIN ${p => p.tables[0].database ? `${escapeTableName({ database: p.tables[0].database, schema: "INFORMATION_SCHEMA", label: "TABLES" })}` : 'INFORMATION_SCHEMA.TABLES'} AS T ON C.TABLE_NAME = T.TABLE_NAME
  AND C.TABLE_SCHEMA = T.TABLE_SCHEMA
  AND C.TABLE_CATALOG = T.TABLE_CATALOG
WHERE LOWER(C.TABLE_SCHEMA) NOT IN ('information_schema', 'sys', 'guest')
  AND LOWER(C.TABLE_SCHEMA) NOT LIKE 'db\\_%' ESCAPE '\\'
  ${p => p.tables.filter(t => !!t.label).length
    ? `AND LOWER(C.TABLE_NAME) IN (${p.tables.filter(t => !!t.label).map(t => `'${t.label}'`.toLowerCase()).join(', ')})`
    : ''
  }
  ${p => p.search
    ? `AND (
      (C.TABLE_NAME + '.' + C.COLUMN_NAME) LIKE '%${p.search}%'
      OR C.COLUMN_NAME LIKE '%${p.search}%'
    )`
    : ''
  }
ORDER BY C.TABLE_NAME,
  C.ORDINAL_POSITION
OFFSET 0 ROWS
FETCH NEXT ${p => p.limit || 100} ROWS ONLY
`;

export const fetchStoredProcedures: IBaseQueries['fetchStoredProcedures'] =  queryFactory`
SELECT (SCHEMA_NAME(o.schema_id) + '.' + o.name) AS label,
  o.name AS "procedure",
  'connection.storedProcedures' as "type",
  'bracket-dot' as "iconId"
FROM sys.sql_modules m INNER JOIN sys.objects o ON m.object_id = o.object_id 
WHERE o.type = 'P' 
ORDER BY (SCHEMA_NAME(o.schema_id) + '.' + o.name)
`;

export const fetchScalarFunctions: IBaseQueries['fetchScalarFunctions'] =  queryFactory`
SELECT (SCHEMA_NAME(o.schema_id) + '.' + o.name) AS label,
  o.name AS "function",
  'connection.scalarFunctions' as "type",
  'bracket-dot' as "iconId"
FROM sys.sql_modules m INNER JOIN sys.objects o ON m.object_id = o.object_id 
WHERE o.type = 'FN'
ORDER BY (SCHEMA_NAME(o.schema_id) + '.' + o.name)
`;

export const fetchTableValuedFunctions: IBaseQueries['fetchTableValuedFunctions'] =  queryFactory`
SELECT (SCHEMA_NAME(o.schema_id) + '.' + o.name) AS label,
  o.name AS "function",
  'connection.tableValuedFunctions' as "type",
  'bracket-dot' as "iconId"
FROM sys.sql_modules m INNER JOIN sys.objects o ON m.object_id = o.object_id 
WHERE o.type = 'TF' 
ORDER BY (SCHEMA_NAME(o.schema_id) + '.' + o.name)
`;

export const fetchAggregateFunctions: IBaseQueries['fetchAggregateFunctions'] =  queryFactory`
SELECT (SCHEMA_NAME(o.schema_id) + '.' + o.name) AS label,
  o.name AS "function",
  'connection.aggFunctions' as "type",
  'bracket-dot' as "iconId"
FROM sys.sql_modules m INNER JOIN sys.objects o ON m.object_id = o.object_id 
WHERE o.type = 'AF' 
ORDER BY (SCHEMA_NAME(o.schema_id) + '.' + o.name)
`;

export const fetchParameters: IBaseQueries['fetchFParameters'] =  queryFactory`
-- source: https://www.mssqltips.com/sqlservertip/1669/generate-a-parameter-list-for-all-sql-server-stored-procedures-and-functions/
SELECT 
   PM.Parameter_ID AS [ParameterID],
   (CASE
      WHEN PM.Parameter_ID = 0 THEN 'Returns'
      ELSE PM.Name
      END)
   + ' (' +
   (TYPE_NAME(PM.User_Type_ID))
   + ', ' +
   (CASE
      WHEN PM.Is_Output = 1 THEN 'Output'
      ELSE 'Input'
      END)
    + ')' AS label,
    'connection.parameters' as "type",
    'symbol-field' as "iconId",
    '${ContextValue.NO_CHILD}' as "childType"
FROM sys.objects AS SO
INNER JOIN sys.parameters AS PM ON SO.OBJECT_ID = PM.OBJECT_ID
WHERE SO.TYPE IN ('P', 'FN', 'TF', 'AF')
AND SO.name = '${p => p.function ? p.function : p.procedure}'
ORDER BY SO.Type_Desc, label, SO.Name, PM.parameter_id
`;

export const fetchSynonyms: IBaseQueries['fetchSynonyms'] =  queryFactory`
SELECT name AS label,
  'connection.synonym' as "type",
  'copy' as "iconId"
FROM ${p => p.database ? `${p.database}.sys.synonyms` : 'sys.synonyms'}
ORDER BY name;
`;

export const fetchUsers: IBaseQueries['fetchUsers'] =  queryFactory`
SELECT name AS label,
  'connection.users' as "type",
  'symbol-field' as "iconId"
FROM sysusers
WHERE islogin = 1
ORDER BY name
`;

export const fetchDatabaseRoles: IBaseQueries['fetchDatabaseRoles'] =  queryFactory`
SELECT name AS label,
  'connection.dbRoles' as "type",
  'symbol-field' as "iconId"
FROM sysusers
WHERE issqlrole = 1
ORDER BY name
`;

export const fetchLinkedServers: IBaseQueries['fetchLinkedServers'] =  queryFactory`
SELECT name AS label,
  'connection.linkedServers' as "type",
  'folder' as "iconId",
  'connection.linkedServerCatalog' as "childType",
  name AS linkedserver
FROM sys.servers
WHERE is_linked = 1
ORDER BY name
`;

export const fetchLinkedServerCatalogs: IBaseQueries['fetchLinkedServerCatalogs'] = queryFactory`
EXEC sp_catalogs @server_name = '${p => p.label}'
`;

export const fetchLinkedServerDatabaseAndSchemas: IBaseQueries['fetchLinkedServerDatabaseAndSchemas'] = queryFactory`
EXEC sp_tables_ex @table_server = '${p => p.label}',
                  @table_type = "'TABLE','VIEW'"
`;

export const fetchLinkedServerSchemas: IBaseQueries['fetchLinkedServerSchemas'] = queryFactory`
EXEC sp_tables_ex @table_server = '${p => p.label}',
                  @table_catalog = '${p => p.database}',
                  @table_type = "'TABLE','VIEW'"
`;

export const fetchLinkedServerTables: IBaseQueries['fetchLinkedServerTables'] = queryFactory`
EXEC sp_tables_ex @table_server = '${p => p.linkedserver}',
                  @table_schema = '${p => p.schema}',
                  ${p => (p.database && p.database !== 'null') ? `@table_catalog = '${p.database}',`: ''}
                  @table_type = 'TABLE'
`;

export const fetchLinkedServerViews: IBaseQueries['fetchLinkedServerViews'] = queryFactory`
EXEC sp_tables_ex @table_server = '${p => p.linkedserver}',
                  @table_schema = '${p => p.schema}',
                  ${p => (p.database && p.database !== 'null') ? `@table_catalog = '${p.database}',`: ''}
                  @table_type = 'VIEW'
`;

export const fetchLinkedServerColumns: IBaseQueries['fetchLinkedServerColumns'] = queryFactory`
EXEC sp_columns_ex @table_server = '${p => p.linkedserver}',
                   @table_name = '${p => p.label}',
                   ${p => (p.database && p.database !== 'null') ? `@table_catalog = '${p.database}',`: ''}
                   @table_schema = '${p => p.schema}'
`