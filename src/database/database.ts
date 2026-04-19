import { Db, MongoClient } from "mongodb";
import { Log } from "../log/log";

export class Database {
    private readonly uri: string;
    private readonly dbName: string;
    private readonly log: Log;
    private client: MongoClient | null = null;
    private db: Db | null = null;

    constructor(uri: string, dbName: string, log: Log = new Log("DB")) {
        this.uri = uri;
        this.dbName = dbName;
        this.log = log;
    }

    async connect(): Promise<Db> {
        if (this.db) {
            this.log.warn(`Already connected to database ${this.dbName}`);
            return this.db;
        }

        this.log.ok(`Connecting to database ${this.dbName}`);

        try {
            this.client = new MongoClient(this.uri);
            await this.client.connect();
            this.db = this.client.db(this.dbName);
            this.log.ok(`Connected to database ${this.dbName}`);
        } catch (error) {
            this.log.error(`Failed to connect to database ${this.dbName}`);
            throw error;
        }

        return this.db;
    }

    getDb(): Db {
        if (!this.db) {
            throw new Error("Database is not connected. Call connect() first.");
        }

        return this.db;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            this.log.warn(`Disconnecting from database ${this.dbName}`);
            await this.client.close();
            this.client = null;
            this.db = null;
            this.log.ok(`Disconnected from database ${this.dbName}`);
            return;
        }

        this.log.warn(`Disconnect skipped, no active connection for ${this.dbName}`);
    }
}
