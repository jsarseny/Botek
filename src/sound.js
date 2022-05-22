import VK from "./vk.js";
import Bot from "../bot.mjs";
import DataBase from "./lib/db.js";
import Sentence from "./sentence.js";
import GoogleTTS from "google-tts-api";

import Syntax, { customFormParser } from "./syntax.js";

import { randomElement } from "./lib/util.js";
import { internalError } from "./static.js";

const deployBase64 = async (base64, peer_id) => {
    let buffer = Buffer.from(base64.replace("data:audio/ogg; codecs=opus;base64,", ""), "base64");

    const request = await VK.uploadAudio(buffer, peer_id);
    if (!request || request.error || !request.docId) return false;

    return request.docId;
}

const Sound = {
    async buildSound(text) {
        let chunks = text;
        let base64 = "";

        const audio = await GoogleTTS.getAllAudioBase64(chunks, {
            lang: "ru",
            slow: false,
            host: "https://translate.google.com",
            timeout: 10000,
            splitPunct: " "
        });

        audio.forEach(item => base64 += item.base64);
        return base64;
    },
    
    async command(ctx) {
        // base sintax: /d aud [text]
        let params = ctx.message.text.split(" ");
        let isRandomMode = true;

        if (params[2]) isRandomMode = false;

        Bot.execute("messages.setActivity", { peer_id: ctx.message.peer_id, type: "audiomessage" });

        let text = isRandomMode
            ? await Syntax.generateRandom()
            : params.slice(2).join(" ");
        const base64 = await this.buildSound(text);
        const docId = await deployBase64(base64, ctx.message.peer_id);

        if (!docId) return internalError(ctx);
        const catalog = await DataBase.getWords();

        return ctx.reply(
            Sentence.buildSentence(catalog, {
                beginPreset: randomElement([ "Тут о", "Здесь о", "Говорю о", "Короче о" ]),
                orderPreset: [ 1 ],
                customWordParser: word => customFormParser(word, [ "ПР" ])
            }), 
            docId
        );
    } 
}

export default Sound;