import API from "node-vk-bot-api";

import Log from "../src/lib/log.js";
import Leet from "../src/leet.js";
import Sound from "../src/sound.js";
import Token from "../token.js";
import Images from "../src/image.js";
import Neural from "../src/neural.js";
import Syntax from "../src/syntax.js";
import Update from "../src/lib/update.js";
import Explore from "../src/explore.js";
import DataBase from "../src/lib/db.js";
import Sentence from "../src/sentence.js";
import Moderate from "../src/moderate.js";

import Static, { internalError } from "../src/static.js";

export const Config = {
    version: "4.25.0",
    shouldUpdate: false,
    adminId: 515443305,
    groupId: 212137299,
    startTimestamp: new Date(),
    service_token: Token.ServiceToken,
    access_token: Token.AccessToken,
    oauth_url: `https://oauth.vk.com/authorize?client_id=8150055&display=page&redirect_uri=&scope=stories,photos,app_widget,docs,manage&response_type=token&v=5.131`
}

export const isStrictCommand = text => {
    return /^(@bot.dolbaelb)?(\/|!)(д|d)/ig.test(text);
}

const payloadEvents = {};
export const BotEvent = {
    bindEvent: (event, cb) => (payloadEvents[event] = payloadEvents[event] || []).push(cb),
    execute: (event, ctx, data) => {
        if (!payloadEvents[event]) return;
        return payloadEvents[event].map(callback => {
            return callback(ctx, data);
        });
    }
}

const Bot = new API({ 
    group_id: Config.groupId,
    token: Config.access_token
});

(async () => {
    const Polling = () => {
        const buildSentence = async ctx => {
            const catalog = await DataBase.getWords();

            if (!catalog) return internalError(ctx);
            const sentence = Sentence.buildSentence(catalog);

            return ctx.reply(sentence);
        }

        const getStatistic = async ctx => {
            const { version, startTimestamp } = Config;
            
            const catalog = await DataBase.getWords();
            const neural = await DataBase.getNeural();

            if (!catalog || !neural) return internalError(ctx);

            const partsOfSpeech = Object.keys(catalog);
            var wordsCount = 0;
            partsOfSpeech.forEach(part => wordsCount += catalog[part].length);

            var workTimeOffset = new Date() - startTimestamp;
            var workTimeSeconds = Math.floor(workTimeOffset / 1000).toLocaleString();

            const replyText = (
                `🚀 Статистика\n\n`
                + `Neural Nodes: ${neural.textNodes.length}\n\n`
                + `Слов в базе: ${wordsCount}\n`
                + `Частей речи: ${partsOfSpeech.length}\n`
                + `Работает: ${workTimeSeconds}s\n\n`
                + `v${version}`
            );
            return ctx.reply(replyText);
        }

        // Neural learning middleware:
        Bot.command("", (ctx, next) => {
            if (isStrictCommand(ctx.message.text)) return next();

            return Neural.middleware(ctx, next);
        });

        // VK API functional router
        Bot.command("", async (ctx, next) => {
            const { payload } = ctx.message;

            if (payload && "string" == typeof payload) {
                var parsed = JSON.parse(payload);

                if (!parsed.event) return next();
                else return BotEvent.execute(parsed.event, ctx, parsed);
            }

            return next();
        });

        Bot.command("", async (ctx, next) => {
            const { text, from_id } = ctx.message;
            if (isStrictCommand(text)) return next();

            const words = text.split(" ");

            // memory new words from message
            //if (from_id === Config.adminId) await Syntax.memo(words);

            return Syntax.commonHandle(ctx, next);
        });

        Bot.command(/^(\/|!)(д|d)/ig, async ctx => {
            const { text } = ctx.message;

            if (!text || text.length < 1) return;

            var isHookTriggered = false;
            const useCommand = (command, cb) => {
                let wrap = `^(@bot.dolbaelb)?(\/|!)(д|d) ${command}`;
                const safe = new RegExp(wrap, "ig");

                if (safe.test(text) && !isHookTriggered) {
                    isHookTriggered = true;
                    return cb(ctx);
                }
                
                return false;
            }

            const available = {
                stat: getStatistic,
                rnd: Syntax.generateRandom,
                img: Syntax.generatePicture,
                help: ctx => ctx.reply(Static.Help),
                moder: ctx => Moderate.handleMessage(ctx),

                "(aud(io)?|rec(ord)?|скажи)": ctx => Sound.command(ctx),
                "басы": ctx => Sound.buildBassboost(ctx),

                "(цитата|quote)": ctx => Images.buildQuote(ctx),
                "(adv(ice)?)|(эдв(айс)?)": ctx => Images.buildAdvice(ctx),
                "(jp(e)?g|(д)?ж(и)?п(е)?г)": ctx => Images.buildLowQuality(ctx),
                "(screen(shot)?|скрин(шот)?)": ctx => Images.buildScreenshoot(ctx),
                "(dem(otivator)?)|(дем(отиватор)?)": ctx => Images.buildDemotivator(ctx),
                "(concat(enate)?|конкат(енир(овать|уй))?)": ctx => Images.buildConcat(ctx),

                "(1337|leet)": ctx => Leet.command(ctx, "1337"),
                "(lame|l4m3)": ctx => Leet.command(ctx, "lame"),

                "word": ctx => Sentence.buildRandom(ctx),
                "(math|вычисли)": ctx => Syntax.math(ctx),
                "(weather|погода)": ctx => Explore.getCurrentWeather(ctx),
                "(anecdote|joke|анек(дот)?|прикол)": ctx => Syntax.getJoke(ctx),
                "(wi|wiki|((что|кто) (так(ое|ой|ая|ие)|значит)|(what|who) is)) ([^\\s]){1,}": ctx => Syntax.getShortExplore(ctx),
            }

            Object.keys(available).map(command => {
                if (isHookTriggered) return;
                useCommand(command, available[command]);
            });

            if (!isHookTriggered) return buildSentence(ctx);
            return false;
        });

        if (Config.shouldUpdate) Update.startGroupUpdate();

        Log.print("Polling module enabled");
    }

    const Init = () => {
        return new Promise((resolve, reject) => {
            Bot.startPolling(err => {
                Log.print("Trying to connect via VK Longpoll API...");

                if (err) return reject(err);
                else return resolve();
            });
        });
    }
    
    return Init().then(() => {
        Log.print("Longpoll API launched. Start polling...");

        return Polling();
    }).catch(err => {
        Log.print("[Error]: Failed to launch!", err);
    });
})();

export default Bot;