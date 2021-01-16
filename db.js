const sqlite3 = require('sqlite3');
const winston = require('winston');

class SqliteDatabase {
	constructor(filename, schema = null) {
		this.filename = filename;
		this.db = new sqlite3.Database(filename);

		if (schema !== null) {
			this.initTables(schema);
		}
	}

	/**
	* To protect against names/values with hyphens.
	* Conventionally, in SQLite there should be double quotes around column names
	* and single quotes around strings, but double quotes work for both.
	* 
	* @param {string|number} k The name to protect.
	* @return {string|number} Double-quoted string or the original number.
	*/
	quote(k) {
		return typeof k === 'string' ?  '"' + k + '"' : k;
	}

	/**
	* Wraps each item in the array in quotes if it is a string.
	* 
	* @param {!Array<string|number>} arr An array of values to protect.
	* @param {!Array<string|number>} Array of quoted strings or the original items.
	*/
	quoteAll(arr) {
		return arr.map((v) => {
			return typeof v === 'string' ? this.quote(v) : v;
		});
	}

	/**
	* Initializes the database tables according to the given schema.
	* Expected schema is an array of objects, with a tableName property and 
	* a columns property, which is an array of tuples of column name and data type.
	* e.g.
	* [{
	*    tableName: 'questions',
	*    columns: [['author', 'NUMERIC'], ['questionText', 'TEXT']]
	* }]
	* 
	* @param {!Array<!Object>} schema
	*/
	initTables(schema) {
		this.db.run('BEGIN EXCLUSIVE TRANSACTION;');
		for (let table of schema) {
			const name = table.tableName;
			// Create the table.
			this.db.serialize(() => {
				// Wrap the column name in quotes and join together.
				const flattenedColumns = table.columns.map((v) => {
					v[0] = this.quote(v[0]);
					return v.join(' ');
				});
				const columnString = flattenedColumns.join(', ');
				this.db.run(`CREATE TABLE IF NOT EXISTS "${name}" (${columnString});`);
				winston.info(`CREATE TABLE IF NOT EXISTS "${name}" (${columnString});`);
			});
		}
		// Attempt to commit everything.
		// We can't use a try/catch because sqlite3 errors are not thrown by this command.
		// However, all previous changes will only be permanent if this succeeds. Therefore
		// no changes will be saved unless all changes are able to saved.
		this.db.run('COMMIT TRANSACTION;');
	}

	/**
	* Flattens an object.
	* https://stackoverflow.com/questions/44134212/best-way-to-flatten-js-object-keys-and-values-to-a-single-depth-array
	*
	* @param {!Object} obj The object to flatten (recursively).
	* @param {string} parent Name of the parent of the object.
	* @param {?Object} res Intermediate result.
	* @return {!Object} The flattened object.
	*/
	flattenObj(obj, parent, res = {}){
		for(let key in obj){
		    let propName = parent ? parent + '_' + key : key;
		    if(typeof obj[key] == 'object'){
		        this.flattenObj(obj[key], propName, res);
		    } else {
		        res[propName] = obj[key];
		    }
		}
		return res;
	}

	/**
	* Constructs a string out of an object, flattening it to a sequence of
	* key-value pairs.
	* e.g. {'name': 'John', 'age': 20} =>
	* 'name = John AND age = 20'
	*
	* @param {!Object} params The object to flatten into a string.
	* @param {string} joiner Joiner between key-value pairs.
	* @param {string} kvJoiner Joiner inside key-value pairs.
	* @return {string} Joined string.
	*/
	buildKeyValueString(params, joiner = ' AND ', kvJoiner = '=') {
		const flattenedItem = this.flattenObj(item);
		const paramString = Object.entries(flattenedItem).map(([k, v]) => quote(k) + kvJoiner + quote(v));
		return paramString.join(joiner);
	}

	/**
	* Builds an insertion query.
	*
	* @param {!string} table The name of the table to insert into.
	* @param {?Object} params A dictionary of column names to values to use as parameters.
	* @return {string} The insertion query string.
	*/
	buildInsertQuery(table, params) {
		const flattenedItem = this.flattenObj(params);
		const columnNamesString = this.quoteAll(Object.keys(flattenedItem)).join(', ');
		const dataString = this.quoteAll(Object.values(flattenedItem)).join(', ');
		const insertionString = `INSERT INTO "${table}" (${columnNamesString}) VALUES (${dataString});`;
		return insertionString;
	}

	/**
	* Builds a select query.
	*
	* @param {!string} table The name of the table to select.
	* @param {?Object} params A dictionary of column names to values to use as parameters.
	* @return {string} The select query string.
	*/
	buildSelectQuery(table, params) {
		const whereString = buildKeyValueString(params);
		if (whereString) {
			return `SELECT * FROM "${table}" WHERE ${whereString};`;
		} else {
			return `SELECT * FROM "${table}";`;
		}
	}

	/**
	* Builds an update query.
	*
	* @param {!string} table The name of the table to update.
	* @param {?Object} valueParams A dictionary of column names to values to update.
	* @param {?Object} whereParams A dictionary of column names to values to find items.
	* @return {string} The update query string.
	*/
	buildUpdateQuery(table, valueParams, whereParams = {}) {
		const flattenedValues = this.flattenObj(valueParams);
		const whereParams = this.flattenObj(whereParams);
		const valueString = buildKeyValueString(params, ', ');
		const whereString = buildKeyValueString(params);
		if (whereString) {
			return `UPDATE "${table}" SET ${valueString} WHERE ${whereString};`;
		} else {
			return `UPDATE "${table}" SET ${valueString}";`;
		}
	}

	/**
	* @param {!string} table The name of the table to insert into.
	* @param {?Object} params A dictionary of column names to values to insert.
	*/
	insert(table, params = {}) {
		const query = this.buildInsertQuery(table, params);
		// Serialize queries to ensure commits are finished before closing.
		return this.db.serialize(() => {
			this.db.run(query, params, (err) => {
				if (err) {
					winston.info(err.message);
					return err;
				}
			});
			this.db.run('COMMIT TRANSACTION;');
		});
	}

	/**
	* @param {!string} table The name of the table to select from.
	* @param {?Object} params A dictionary of column names to values to use as parameters.
	* @return {Promise} A promise that resolves into multiple rows of results of the
	*   select query.
	*/
	find(table, params = {}) {
		const query = this.buildSelectQuery(table, params);
		return this.db.all(query, params, (err, rows) => {
			if (err) {
				winston.info(err.message);
				return err;
			}
			return rows;
		});
	}

	/**
	* @param {!string} table The name of the table to select from.
	* @param {?Object} params A dictionary of column names to values to use as parameters.
	* @return {Promise} A promise that resolves into one row of results of the select
	*   query.
	*/
	findOne(table, params = {}) {
		const query = this.buildSelectQuery(table, params);
		return this.db.get(query, params, (err, row) => {
			if (err) {
				winston.info(err.message);
				return err;
			}
			return row;
		});
	}

	/**
	* @param {!string} table The name of the table to update.
	* @param {?Object} valueParams A dictionary of column names to values to update.
	* @param {?Object} whereParams A dictionary of column names to values to find items.
	* @return {Promise} A promise that resolves into an error if there exists an error.
	*/
	update(table, valueParams, whereParams = {}) {
		const query = this.buildUpdateQuery(table, valueParams, whereParams);
		return this.db.serialize(() => {
			return this.db.run(query, params, (err) => {
				if (err) {
					winston.info(err.message);
					return err;
				}
			});
			this.db.run('COMMIT TRANSACTION;');
		});
	}

	/**
	* @param {!string} table The name of the table to update.
	* @param {?Object} valueParams A dictionary of column names to values to update.
	* @param {?Object} whereParams A dictionary of column names to values to find items.
	* @return {Promise} A promise that resolves into an error if there exists an error.
	*/
	atomicQuery(queries) {
		// Serialize queries to ensure each query is run atomically and in sequence.
		return this.db.serialize(() => {
			this.db.run('BEGIN EXCLUSIVE TRANSACTION;');
			for (query of queries) {
				this.db.run(query, null, (err) => {
					if (err) {
						winston.info(err.message);
						return err;
					}
				});
			}
			this.db.run('COMMIT TRANSACTION;');
		});
	}
}