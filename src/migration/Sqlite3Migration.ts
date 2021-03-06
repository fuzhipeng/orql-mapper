import Migration from './Migration';
import Session from '../Session';
import Schema, {Column} from '../Schema';
import {QueryResult} from '../database/Database';

export = class Sqlite3Migration implements Migration {
  async create(session: Session): Promise<void> {
    const schemas = session.schemaManager.schemas;
    for (const [name, schema] of schemas.entries()) {
      await this.createTable(session, schema);
    }
  }
  private async createTable(session: Session, schema: Schema) {
    const columns = schema.columns.map(column => this.genCreateColumn(column));
    const sql = `create table if not exists ${schema.table} (${columns.join(', ')})`;
    await session.nativeUpdate(sql);
  }
  private genCreateColumn(column: Column): string {
    let sql = `${column.field} ${this.genColumnType(column)}`;
    if (column.primaryKey) sql += ' primary key';
    if (column.generatedKey) sql += ' autoincrement';
    if (!column.primaryKey && column.required) sql += ' not null';
    return sql;
  }
  genColumnType(column: Column): string {
    let type = column.type.toString();
    switch (type) {
      case 'int':
        type = 'integer';
        break;
      case 'string':
        type = 'varchar';
        break;
    }
    return column.length != undefined && column.length > 0 ? `${type}(${column.length})` : `${type}`;
  }
  async drop(session: Session): Promise<void> {
    const schemas = session.schemaManager.schemas;
    for (const [name, schema] of schemas.entries()) {
      const exist = await this.existTable(session, schema);
      if (exist) {
        await session.nativeUpdate(`drop table ${schema.table}`);
      }
    }
  }
  async existTable(session: Session, schema: Schema): Promise<boolean> {
    const result = await session.nativeQuery(`SELECT count(*) FROM sqlite_master where type='table' and name='${schema.table}'`);
    return result[0].get(0) == 1;
  }
  async update(session: Session): Promise<void> {
    const database = session.configuration.connectionOptions!.database;
    const schemas = session.schemaManager.schemas;
    for (const [name, schema] of schemas.entries()) {
      const exist = await this.existTable(session, schema);
      if (!exist) {
        await this.createTable(session, schema);
      } else {
        const fields = await session.nativeQuery(`pragma table_info('${schema.table}')`) as QueryResult[];
        const fieldNames = fields.map(field => field.get('name'));
        for (const column of schema.columns) {
          const index = fieldNames.indexOf(column.field);
          if (index < 0) {
            await session.nativeUpdate(`alter table ${schema} add column ${this.genCreateColumn(column)}`);
          }
        }
      }
    }
  }
}