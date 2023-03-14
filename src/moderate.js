import fs from "fs";
import Log from "./lib/log.js";
import Syntax from "./syntax.js";
import DataBase from "./lib/db.js";

import { Config } from "../VK/bot.mjs";
import { fileSize } from "./lib/util.js";
import { internalError } from "./static.js";

const hashText = (text, string, seed) => {
    var hval = !seed ? 0x811c9dc5 : seed;
    for (var i = 0, l = text.length; i < l; i++) {
        hval ^= text.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    if (string) return ("0000000" + (hval >>> 0).toString(16)).substr(-8);
    return hval >>> 0;
};

const Moderate = {
    handleMessage(ctx) {
        if (ctx.message.from_id !== Config.adminId) return onlyAdminAvailable(ctx);
        const { text } = ctx.message;

        switch (true) {
            case /moder.filterdb/ig.test(text): return this.filterDB(ctx);
            case /moder.delwrd/ig.test(text): return this.deleteWord(ctx);
            case /moder.exportLog/ig.test(text): return this.exportLog(ctx);
            case /moder.env/ig.test(text): return this.env(ctx);
            default: return ctx.reply("Command does not exist | 404");
        }
    },

    async deleteWord(ctx) {
        const { text, from_id } = ctx.message;
        const chunks = text.split(" ");
        const targetWords = chunks[2];
        const catalog = await DataBase.getWords();
        
        if (!targetWords || "string" !== typeof targetWords) return ctx.reply("Invalid command statement | 400");
        const words = targetWords.replace(/ |\n/ig, "").split(",");
        const logger = {
            startAt: +new Date(),
            deleted: 0
        }

        words.map(trg => {
            const parser = Syntax.parse(trg);

            if (
                !parser 
                || !parser.valid 
                || !parser.part
            ) return false;

            const { word, part } = parser;
            const previusCount = catalog[part].length;
            
            catalog[part] = catalog[part].filter(item => item !== word);
            logger.deleted += previusCount - catalog[part].length;
        });

        await DataBase.setWords(catalog);

        return ctx.reply(
            `⚙ DataBase\nExecutor: [id${from_id}|id${from_id}]\n\n`
            + `Deleted: ${logger.deleted}\n`
            + `(Took ${+new Date - logger.startAt} ms)`
        );
    },
    exportLog(ctx) {
        const { text, from_id } = ctx.message;
        const commandChunks = text.split(" ");
        var filename = "server.[hash].txt";

        var customFilename = commandChunks && commandChunks[2];
        if (customFilename) filename = customFilename;

        const startAt = +new Date();
        const journal = Log.getLog().join("\n");
        filename = filename.replace(/\[hash\]/ig, hashText(Log.getTime(), true))
        if (!/\.(txt|log)/ig.test(filename)) filename = filename + ".txt";

        fs.writeFile(`./log/${filename}`, journal, { encoding: "utf-8" }, (err) => {
            if (err) return internalError(ctx), console.log(err);

            Log.print(`Log export as ${filename}`, from_id);
            return ctx.reply(
                `⚙ Network\nExecutor: [id${from_id}|id${from_id}]\n\n`
                + `Log saved as ${filename}\n`
                + `(Took ${+new Date - startAt} ms)`
            );
        });
    },
    env(ctx) {
        const { from_id, peer_id } = ctx.message;
        const { env, version, arch } = process;
        const { OS } = env;

        var memory = process.memoryUsage();
        var memoryTotal = 0;
        Object.keys(memory).map(item => memoryTotal += memory[item]);

        return ctx.reply(
            `⚙ Network\n\n`
            + `PID: ${peer_id}\n`
            + `FID: [id${from_id}|id${from_id}]\n`
            + `GID: [club${Config.groupId}|-${Config.groupId}]\n`
            + `[Longpoll API v5.103]\n\n`
            + `Platform: NodeJS ${version}\n`
            + `OS: ${OS} (${arch})\n`
            + `DB: MongoDB (NoSQL)\n`
            + `Memory: ${fileSize(memoryTotal)}\n\n`
            + `v${Config.version}`
        );
    },

    async filterDB(ctx) {
        const { from_id } = ctx.message;

        const storage = await DataBase.getWords();

        if (!storage || !Array.isArray(storage)) return internalError(ctx);

        var resultStorage = [];
        const logger = {
            startAt: +new Date(),
            total: storage.length,
            formatted: 0
        }

        storage.forEach(word => {
            var chunk = Syntax.parse(word);

            if (!chunk) return;
            if (chunk !== word) logger.formatted += 1;

            return resultStorage.push(chunk);
        });

        resultStorage = [...new Set(resultStorage)];

        await DataBase.setWords(resultStorage);

        return ctx.reply(
            `⚙ DataBase\nExecutor: [id${from_id}|id${from_id}]\n\n`
            + `Viewed: ${logger.total}\n`
            + `Formatted: ${logger.formatted}\n`
            + `Deleted: ${storage.length - resultStorage.length}\n`
            + `Total count: ${resultStorage.length}\n\n`
            + `(Took ${+new Date - logger.startAt} ms)`
        );
    }
}

export default Moderate;