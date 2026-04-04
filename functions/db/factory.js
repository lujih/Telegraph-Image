import { KVDatabase } from "./kv.js";
import { D1Database } from "./d1.js";

export function createDatabase(env) {
    // D1 takes priority if both are configured
    if (env.img_db) {
        const d1 = new D1Database(env);
        return d1;
    }
    if (env.img_url) {
        return new KVDatabase(env);
    }
    return null;
}
