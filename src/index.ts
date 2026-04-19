import { Log } from "./log/log";
let log = new Log("Main");

log.ok("This message is ok!");
log.warn("This is a warning!");
log.error("This is an error!");