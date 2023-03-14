import Canvas from "canvas";

import VK from "../vk.js";
import Bot from "../../VK/bot.mjs";
import DataBase from "./db.js";
import Sentence from "../sentence.js";

import { customFormParser } from "../syntax.js";

const { createCanvas, loadImage } = Canvas;

const UPDATE_RATE = 1000 * 60 * 4; // 4 min

const intervalGroupUpdate = async () => {
    const catalog = await DataBase.getWords();

    const groupDescription = Sentence.buildSentence(catalog);
    const groupTitle = Sentence.buildSentence(catalog, {
        orderPreset: [1],
        customWordParser: word => customFormParser(word, [ "ЕД", "ИМ" ])
    });

    // interval update group info
    Bot.execute("groups.edit", {
        group_id: 212137299,
        description: `Бот-${groupTitle}\n${groupDescription}`
    }).catch(console.log);

    // update cover
    const canvas = createCanvas(1590, 530);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1590, 530);

    const snippetImg = await loadImage(
        "https://sun9-81.userapi.com/impg/KV_clsns2UsDWjM2nJtSVNskzFsNY4HimGpu3w/7tEfAAu-qFc.jpg?size=864x864&quality=95&sign=6bd8543ff5533567ab61bb62d9b5aa59&type=album"
    );
    
    ctx.fillStyle = "#000";
    ctx.font = "50px Arial";
    ctx.textBaseline = "middle";
    ctx.drawImage(snippetImg, 0, 0, 530, 530);
    ctx.fillText(`©  "${Sentence.buildSentence(catalog)}"`, 530, 250);

    return VK.uploadCover(canvas.toBuffer(), {
        cropX2: 1590,
        cropY2: 530
    });
}

const Update = {
    startGroupUpdate() {
        intervalGroupUpdate();

        return setInterval(intervalGroupUpdate, UPDATE_RATE);
    }
}

export default Update;