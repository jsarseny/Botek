import axios from "axios";
import AudioDecode from "audio-decode";
import WebAudioApi from "@descript/web-audio-js";
import WebAudioEngine from "web-audio-engine";

import VK from "./vk.js";
import Bot from "../VK/bot.mjs";
import Blob from "./lib/blob.js";
import DataBase from "./lib/db.js";
import Sentence from "./sentence.js";
import GoogleTTS from "google-tts-api";

import Syntax, { customFormParser } from "./syntax.js";

import { internalError } from "./static.js";
import { randomElement } from "./lib/util.js";
import { getTypedAttachments } from "./image.js";

import fs from "fs";

const {
    OfflineAudioContext,
    StreamAudioContext,
    RenderingAudioContext
} = WebAudioApi;

const Sound = {
    async buildBassboost(ctx) {
        const { message } = ctx;

        const attachment = getTypedAttachments(ctx.message, "audio");
        if (!attachment) return ctx.reply("0");

        const targetUrl = attachment.audio.url;
        const buffer = await getBufferByUrl(targetUrl);

        const context = new RenderingAudioContext();
        const audioBuffer = await AudioDecode(buffer);
        console.log(audioBuffer);

        /*context.encodeAudioData(audioBuffer).then(async arrayBuffer => {
            fs.writeFileSync("output.wav", Buffer.from(arrayBuffer));
            const request = await VK.uploadAudio(Buffer.from(arrayBuffer), message.peer_id, {
                type: "audio/wav",
                ext: "wav"
            });
    
            if (!request || request.error || !request.docId) return false;
            return ctx.reply("Держи", request.docId);
        });
        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.start();

        const filter = context.createBiquadFilter();
        filter.type = "lowshelf";
        filter.Q.value = 1;
        filter.frequency.value = 1000;
        filter.gain.value = 25;

        source.connect(filter);
        filter.connect(context.destination);

        context.processTo(attachment.audio.duration);
        context.encodeAudioData(outputAudioBuffer).then((arrayBuffer) => {
            fs.writeFileSync('output.wav', new Buffer.from(arrayBuffer));
        });
        return;*/
        const resultingBuffer = await applyFilterToBuffer(audioBuffer);

        context.encodeAudioData(resultingBuffer).then(async arrayBuffer => {
            const buf = Buffer.from(arrayBuffer);
            const request = await VK.uploadAudio(buf, message.peer_id, {
                type: "audio/wav",
                ext: "wav"
            });
    
            if (!request || request.error || !request.docId) return false;
    
            return ctx.reply("Держи", request.docId);
        });
        return;
    },

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

async function applyFilterToBuffer(buffer) {
    const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
    );

    const bufferNode = offlineCtx.createBufferSource();
    bufferNode.buffer = buffer;
    bufferNode.start();

    const filterNode = offlineCtx.createBiquadFilter();
    filterNode.type = "lowshelf";
    filterNode.frequency.value = 240;
    filterNode.detune.value = 650;
    filterNode.Q.value = 1;
    filterNode.gain.value = 15;

    bufferNode.connect(filterNode);
    filterNode.connect(offlineCtx.destination);

    return offlineCtx.startRendering();
}

export default Sound;

function audioBufferToWave(audioBuffer) {
    const length =
      audioBuffer.length * audioBuffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    var channels = [];

    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(audioBuffer.numberOfChannels);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * audioBuffer.numberOfChannels); // avg. bytes/sec
    setUint16(audioBuffer.numberOfChannels * 2); // block-align
    setUint16(16); // 16 bits per sample

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // data size: file size - 44 bytes

    // split channels
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    // write interleaved
    let offset = 0;
    while (pos < length) {
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        // interleave channels
        let sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
        view.setInt16(pos, sample, true); // update data chunk
        pos += 2;
      }
      offset++; // next source sample
    }

    // create Blob
    return new Blob([arrayBuffer], { type: "audio/wav" });

    function setUint16(data) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
}

const getBufferByUrl = async url => {
    const response = await axios.get(url,  { responseType: "arraybuffer" });

    return Buffer.from(response.data, "utf-8");
}

const deployBase64 = async (base64, peer_id) => {
    let buffer = Buffer.from(base64.replace("data:audio/ogg; codecs=opus;base64,", ""), "base64");

    const request = await VK.uploadAudio(buffer, peer_id);
    if (!request || request.error || !request.docId) return false;

    return request.docId;
}