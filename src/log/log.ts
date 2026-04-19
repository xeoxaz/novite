import { Colors } from "./colors";

export class Log{
    name: string;

    constructor(name: string){
        this.name = name;
    }

    ok(message: string = "?"){
        this.out(message, 0);
    }

    warn(message: string = "?"){
        this.out(message, 1);
    }

    error(message: string = "?"){
        this.out(message, 2);
    }

    private colorTextKeepingGraySymbols(text: string, color: (text: string) => string): string {
        let out: string = "";
        let wordChunk: string = "";

        for(const char of text){
            if(/[a-zA-Z0-9\s]/.test(char)){
                wordChunk += char;
            }
            else{
                if(wordChunk.length > 0){
                    out += color(wordChunk);
                    wordChunk = "";
                }

                out += Colors.gray(char);
            }
        }

        if(wordChunk.length > 0){
            out += color(wordChunk);
        }

        return out;
    }

    private getTimestamp24h(): string {
        const now: Date = new Date();
        const hours: string = String(now.getHours()).padStart(2, "0");
        const minutes: string = String(now.getMinutes()).padStart(2, "0");
        const seconds: string = String(now.getSeconds()).padStart(2, "0");

        return `${hours}:${minutes}:${seconds}`;
    }

    private formatColumn(text: string, maxWidth: number): string {
        const trimmed: string = text.length > maxWidth ? text.slice(0, maxWidth) : text;
        return trimmed.padEnd(maxWidth, " ");
    }

    private out(message: string = "?", code: number = 0){
        let status: string = "?";
        let color: (text: string) => string = Colors.blue;
        const nameColumnWidth: number = 4;
        const statusColumnWidth: number = 4;

        if(code === 0){
            status = "Ok";
            color = Colors.green;
        }
        if(code === 1){
            status = "Warn";
            color = Colors.yellow;
        }
        if(code === 2){
            status = "Error";
            color = Colors.red;
        }

        const fixedName: string = this.formatColumn(this.name, nameColumnWidth);
        const fixedStatus: string = this.formatColumn(status, statusColumnWidth);
        const timestamp: string = this.getTimestamp24h();

        console.log(`${Colors.gray("[")}${this.colorTextKeepingGraySymbols(timestamp, Colors.blue)}${Colors.gray("]")} ${Colors.gray("[")}${this.colorTextKeepingGraySymbols(fixedName, Colors.blue)}${Colors.gray("]")} ${Colors.gray("[")}${this.colorTextKeepingGraySymbols(fixedStatus, color)}${Colors.gray("]")} ${this.colorTextKeepingGraySymbols(message, color)}`);
    }
}