const Log = {
    __internal: [],

    print(...chunks) {
        const [ header, body ] = [ `>> [${this.getTime()}] [NETWORK]:`, chunks.join(" ") ];
        const fullLogString = [ header, body ].join(" ");

        this.__internal.push(fullLogString);
        return console.log(header, ...chunks);
    },
    getTime(timestamp, sec = true, ms = true) {
        const date = timestamp ? new Date(timestamp) : new Date();
        const [ a, b, c, d ] = [ 
            String(date.getDate()).padStart(2, "0"), 
            String(date.getMonth() + 1).padStart(2, "0"), 
            String(date.getSeconds()).padStart(2, "0"), 
            String(date.getMilliseconds()).padStart(3, "0")
        ];

        var parsed = `${a}.${b}.${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; 
        if (sec) parsed += `:${c}`;
        if (sec && ms) parsed += `.${d}`;

        return parsed;
    },
    getLog() {
        return this.__internal;
    }
}

export default Log;