import { Database } from "./database/database";
import { Log } from "./log/log";
import { ObjectId } from "mongodb";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type EntityType = "person" | "evidence" | "event" | "concept";
type LinkType = "fact" | "theory" | "contradiction" | "weak";

type Entity = {
    id: string;
    type: EntityType;
    title: string;
    notes: string;
    x: number;
    y: number;
    metadata: Record<string, string>;
};

type Link = {
    id: string;
    fromId: string;
    toId: string;
    type: LinkType;
    label: string;
};

type Board = {
    _id: string;
    entities: Entity[];
    links: Link[];
    createdAt: Date;
    updatedAt: Date;
};

const log: Log = new Log("API");
const mongoUri: string = Bun.env.MONGO_URI ?? "mongodb://127.0.0.1:27017";
const mongoDbName: string = Bun.env.MONGO_DB_NAME ?? "novite";
const port: number = Number(Bun.env.PORT ?? 3000);

const database = new Database(mongoUri, mongoDbName, new Log("DB"));
await database.connect();
const boards = database.getDb().collection<Board>("boards");

const publicDir = new URL("../public/", import.meta.url);
const uploadsDir = new URL("../public/uploads/", import.meta.url);
await mkdir(fileURLToPath(uploadsDir), { recursive: true });

function defaultBoard(boardId: string): Board {
    const now = new Date();

    return {
        _id: boardId,
        entities: [],
        links: [],
        createdAt: now,
        updatedAt: now
    };
}

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}

async function getOrCreateBoard(boardId: string): Promise<Board> {
    const existing = await boards.findOne({ _id: boardId });

    if (existing) {
        return existing;
    }

    const created = defaultBoard(boardId);
    await boards.insertOne(created);
    return created;
}

function normalizeBoardInput(input: Partial<Board>, current: Board): Board {
    return {
        _id: current._id,
        entities: Array.isArray(input.entities) ? input.entities : current.entities,
        links: Array.isArray(input.links) ? input.links : current.links,
        createdAt: current.createdAt,
        updatedAt: new Date()
    };
}

function parseBoardId(pathname: string): string | null {
    const match = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)$/);
    return match?.[1] ?? null;
}

function safeFileSuffix(filename: string): string {
    const match = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/);
    return match ? `.${match[1]}` : ".png";
}

async function serveStatic(pathname: string): Promise<Response> {
    const requested = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const fileUrl = new URL(requested, publicDir);
    const file = Bun.file(fileUrl);

    if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
    }

    return new Response(file);
}

Bun.serve({
    port,
    idleTimeout: 30,
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const boardId = parseBoardId(url.pathname);

        if (boardId && request.method === "GET") {
            const board = await getOrCreateBoard(boardId);
            return json(board);
        }

        if (boardId && request.method === "PUT") {
            const current = await getOrCreateBoard(boardId);

            let payload: Partial<Board>;
            try {
                payload = await request.json() as Partial<Board>;
            } catch {
                return json({ error: "Invalid JSON payload" }, 400);
            }

            const next = normalizeBoardInput(payload, current);
            await boards.updateOne({ _id: boardId }, { $set: next }, { upsert: true });

            return json(next);
        }

        if (url.pathname === "/api/health") {
            return json({ status: "ok", mongo: mongoDbName, bson: ObjectId.createFromTime(Math.floor(Date.now() / 1000)).toHexString() });
        }

        if (url.pathname === "/api/upload/image" && request.method === "POST") {
            let form;

            try {
                form = await request.formData();
            } catch {
                return json({ error: "Invalid form data" }, 400);
            }

            const filePart = form.get("image");

            if (!(filePart instanceof File)) {
                return json({ error: "Missing file field: image" }, 400);
            }

            if (!filePart.type.startsWith("image/")) {
                return json({ error: "Only image files are supported" }, 400);
            }

            const extension = safeFileSuffix(filePart.name);
            const fileName = `${crypto.randomUUID()}${extension}`;
            const destination = new URL(fileName, uploadsDir);

            await Bun.write(destination, filePart);

            return json({ url: `/uploads/${fileName}` }, 201);
        }

        if (url.pathname === "/favicon.ico") {
            return new Response(null, { status: 204 });
        }

        return await serveStatic(url.pathname);
    }
});

log.ok(`Server ready on http://localhost:${port}`);
