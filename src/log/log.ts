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

    private out(message: string = "?", code: number = 0){
        let status: string = "?";

        if(code === 0){
            status = "Ok";
        }
        if(code === 1){
            status = "Warn";
        }
        if(code === 2){
            status = "Error";
        }

        console.log(`[${this.name}] ${status}: ${message}`);
    }
}