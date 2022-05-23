/**
 * Safe proxy for RegExp constructor
 * @param {string | RegExp} pattern pattern of regular expression
 * @param {string} flags native regexp flags
 */
export class SafeRegExp extends RegExp {
    constructor(pattern, flags) {
        try {
            pattern = pattern.replace(/[\^|\$|\.|\*|\+|\?|\=|\!|\:|\|\\|\/|\(|\)|\[|\]|\{|\}]/ig, "\\$&");

            super(pattern, flags);
        } catch (err) {
            console.log(err);
        }
    }

    static parse(pattern) {
        return pattern.replace(/[\^|\$|\.|\*|\+|\?|\=|\!|\:|\|\\|\/|\(|\)|\[|\]|\{|\}]/ig, "\\$&");
    }
}

// advanced random
export const randomInt = (min, max) => Math.floor(Math.random() * (max - min) + min);
export const randomElement = (array) => array[randomInt(0, array.length)];
export const shuffleArray = (arr) =>  arr.sort(() => Math.round(Math.random() * 100) - 50);
export const chance = (percent) => {
    let random = randomInt(0, 101);

    return random <= percent;
}

// hooks & helpers
export const useGroupChat = (peer_id) => {
    return String(
        Math.abs(peer_id)
    ).length >= 10;
}

export const useCommandParam = (ctx, index) => {
    const text = ctx.message ? ctx.message.text : ctx;
    if (!text) return index ? null : [];

    const params = text.split(" ");
    return index ? params[index] : params;
}

export const sliceCommandPart = (ctx, start = 0, end = Infinity, returnArray = false) => {
    var chunks = useCommandParam(ctx);
    chunks.splice(start, end);

    return returnArray ? chunks : chunks.join(" ");
}

export const fileSize = (bytes) => {
    const units = [ "B", "KB", "MB", "GB", "TB", "PB", "Insane" ];
    const number = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / 1024 ** Math.floor(number)).toFixed(1)} ${units[number]}`;
};

export const upperFirst = (str) => `${str[0].toUpperCase()}${str.slice(1)}`;