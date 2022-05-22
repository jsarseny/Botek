import Morphy from "phpmorphy";
import Markup from "node-vk-bot-api/lib/markup.js";

import VK from "./vk.js"
import Bot from "../bot.mjs";
import Explore from "./explore.js";
import DataBase from "./lib/db.js";

import Images, { 
    getBufferByUrl 
} from "./image.js";

import Static, { 
    internalError, 
    onlyGroupAvailable 
} from "./static.js";

import Sentence, { 
    chance, 
    randomInt,  
    useGroupChat,
    shuffleArray,
    randomElement,
    sliceCommandPart
} from "./sentence.js";

export const morphy = new Morphy("ru", {
    storage: Morphy.STORAGE_MEM,
    predict_by_suffix: true,
    predict_by_db: true,
    graminfo_as_text: true,
    use_ancodes_cache: false,
    resolve_ancodes: Morphy.RESOLVE_ANCODES_AS_TEXT,
});

const Syntax = {
    parse(word, catalog) {
        var chunk = String(word).toLowerCase();

        if (/^[0-1]/.test(chunk)) return false;
        if (/^(https?|ftps|www)/.test(chunk)) return false;
        if (/(https?:\/\/|ftps?:\/\/|www\.)((?![.,?!;:()]*(\s|$))[^\s]){2,}/gim.test(chunk)) return false;

        // replace symbols:
        chunk = chunk.replace(/[^а-яё-]/ig, "");
        chunk = chunk.replace(/ё/ig, "е");
        chunk = chunk.replace(/(^-)|(-$)/ig, "");
        chunk = chunk.trim();

        if (!chunk || !chunk.length) return false;

        var partOfSpeech = morphy.getPartOfSpeech(chunk);
        partOfSpeech = partOfSpeech && partOfSpeech[0];

        if (!partOfSpeech || "string" !== typeof partOfSpeech) return false;
        if (
            catalog
            && catalog[partOfSpeech]
            && catalog[partOfSpeech].indexOf(chunk) >= 0
        ) return false;

        return {
            word: chunk,
            valid: true,
            part: partOfSpeech,
        };
    },
    async memo(words) {
        const catalog = await DataBase.getWords();
        let count = 0;
        
        // handle every word manually
        words.map(item => {
            const parser = this.parse(item, catalog);

            if (
                !parser 
                || !parser.valid 
                || !parser.part
            ) return false;
            const { word, part } = parser;
            count++;

            catalog[part] = catalog[part] || [];
            catalog[part].push(word);
        });
        //console.log(`+ ${count}`);

        return await DataBase.setWords(catalog);
    },
    async generateRandom(ctx) {
        const commandChunks = ctx && ctx.message.text.split(" ");
        var messageLength = null;

        // check for command in-message params:
        var thirdChunk = commandChunks && Number(commandChunks[2]);
        if (thirdChunk && !Number.isNaN(thirdChunk) && thirdChunk > 0) {
            thirdChunk = thirdChunk > 50 ? 50 : thirdChunk;
            messageLength = thirdChunk;
        }

        // generate by call database
        const catalog = await DataBase.getWords();

        var wordArray = [];
        Object.keys(catalog).forEach(catalogItem => wordArray = wordArray.concat(catalog[catalogItem]));
        wordArray = shuffleArray(wordArray);

        // by default we generate message 2-13 words
        const randomMessageLength = messageLength || randomInt(2, 13);
        var resultMessage = "";

        for (var i = 0; i < randomMessageLength; i++) {
            let randomIndex = randomInt(0, wordArray.length);
            resultMessage += `${wordArray[randomIndex]} `;
        }

        if (ctx) ctx.reply(resultMessage);
        else return resultMessage;
    },
    async generatePicture(ctx) {
        const catalog = await DataBase.getWords();

        await Bot.execute("messages.send", {
            peer_id: ctx.message.peer_id,
            random_id: randomInt(0, 9e2),
            message: Sentence.buildSentence(catalog, {
                beginPreset: "Рисую",
                orderPreset: [ 1 ],
                customWordParser: word => customFormParser(word, [ "ВН" ])
            }).replace("?", "") + "..."
        });

        const image = Images.buildRandomPatternImage();
        const upload = await VK.uploadPhoto(image);

        if (upload.error || !upload.photoId) return internalError(ctx);

        return ctx.reply(
            Sentence.buildSentence(catalog, {
                beginPreset: "Это",
                orderPreset: randomElement([ [ 1 ], [ 2, 1 ] ]),
                customWordParser: word => customFormParser(word, [ "ЕД", "ИМ" ])
            }),
            upload.photoId
        );
    },

    async getShortExplore(ctx) {
        const { text, peer_id, id } = ctx.message;

        var isAnswered = false;
        const realise = (ApiMessage) => {
            isAnswered = true;

            return Bot.execute("messages.send", { peer_id, random_id: randomInt(1, 4096), ...ApiMessage });
        }

        setTimeout(() => {
            if (isAnswered) return;

            Bot.sendMessage(peer_id, "😅 Достаточно сложный запрос, ищу ответ...");
        }, 2500);

        const IDKAnswers = [
            "Я не нашел", "Сам не знаю", "Да я сам не ебу",
            "В душе не ебу", "Понятия не имею", "Мне об этом мало известно",
            "Попробуй что-нибудь другое", "Я такого не знаю",
            "Я забыл 😥"
        ];

        const desired = text.replace(/^((\/|!)(д|d) )?(wi|wiki|((что|кто) (так(ое|ой|ая|ие)|значит)|(what|who) is))/ig, "").trim();
        if (!desired) return realise({ message: randomElement(IDKAnswers) });

        const searchDisered = await Explore.searchWiki(desired);
        if (!searchDisered) return realise({ reply_to: id, message: randomElement(IDKAnswers)});

        const article = await Explore.getWikiSummary(searchDisered.title);
        if (!article || !article.extract) return realise({ reply_to: id, message: randomElement(IDKAnswers)});

        var preview = null;
        if (article.originalimage && article.originalimage.source) {
            const buffer = await getBufferByUrl(article.originalimage.source);
            
            if (buffer) {
                const upload = await VK.uploadPhoto(buffer);
                preview = upload.photoId || null;
            }
        }

        return realise({
            message: article.extract,
            attachment: preview,
            keyboard: Markup.keyboard([[
                Markup.button({ action: { type: "open_link", link: `https://ru.wikipedia.org/wiki/${article.title}`, label: "Wiki 📖" }}), 
                Markup.button({ action: { type: "open_link", link: `https://www.google.com/search?q=${article.title}`, label: "Google 🔎" }})
            ]]).inline()
        });
    },
    math(ctx) {
        const { text } = ctx.message;
        const primary = sliceCommandPart(text, 0, 2);

        if (!primary) return ctx.reply(randomElement([ "Где пример то блять?", "Чето я не понял чо тут решать" ]));

        var example = primary.replace(/:/ig, "/").replace(/\^/ig, "**").replace(/ /ig, "");
        if (!/(^[0-9*\/\\(\\) \.+-]+$)/g.test(example)) {
            return ctx.reply(randomElement([
                "Блядь, я не буду это решать", "Че ты за пример прислал",
                "Как я должен это вычислить?", "У меня не два высших, решай сам",
                "Давай другой", "ААААА БЛЯТЬ Я СЛОМАЛСЯ"
            ]));  
        }

        try {
            var answer = eval(example).toLocaleString();
            var prefix = randomElement([
                "Ответ:", "Судя по всему будет", "По моим расчетам будет",
                "Слишком просто, будет"
            ]);
        } catch (err) {
            return ctx.reply("Пример составлен неверно! 😫");
        }

        return ctx.reply(`${prefix} ${answer}`);
    },

    async commonHandle(ctx, next) {
        const { text, peer_id, from_id } = ctx.message;

        const isGroupChat = useGroupChat(peer_id);
        const isFromBot = from_id < 0;

        const catalog = await DataBase.getWords();

        var isHookTriggered = false;
        var voidHandlers = [];
        const useAvailable = (regex, answerChance, callback) => {
            if (!regex) return voidHandlers.push({ answerChance, callback });
            if (isHookTriggered) return;

            if (regex.test(text)) {
                if (answerChance && !chance(answerChance)) return;
                
                isHookTriggered = true;
                return callback();
            }
        }

        const senderProfile = isFromBot 
        ? await VK.getGroup(from_id)
        : await VK.getUser(from_id);

        var [ senderName, senderSurname ] = [
            !isFromBot ? senderProfile.first_name : senderProfile.name,
            !isFromBot ? senderProfile.last_name : senderProfile.name
        ]

        const Available = [
            [ /^(бот|bot)(яра|ик)?/ig, null, () => {
                var opinionRegex = /^(бот|bot)(яра|ик)?( ты)?( такой)? /ig;

                // if user expresses his opinion about bot
                if (opinionRegex.test(text)) {
                    var parsed = text.replace(opinionRegex, "").trim();

                    var isGoodOpinion = 
                        /крут|найс|норм|молод|преселн|шикар|супе|прекра|замеч|неплох|х(о|а)рош|(а|о)хуен|заебат/ig.test(parsed);
                    if (!isGoodOpinion) {
                        return ctx.reply(`${randomElement([
                            "Мамка твоя", "Батя твой",
                            senderName + ", ты"
                        ])} ` + parsed);
                    } else return ctx.reply(randomElement([
                        "Мы это и так знаем", "Кто бы сомневался",
                        "Да само собой 😎", "Спасибо за напоминание"
                    ]));
                }

                return ctx.reply(randomElement([
                    "Я нейросеть", `Блять, зато я знаю, что такое ${randomElement([ "подлежащее", "сказуемое", "местоимение" ])} 🙄`,
                    "Тут таких нет", "Кого ты обосрать решил, клоун?",
                    Sentence.buildSentence(catalog),
                    Static.Default()
                ]));
            }],

            [ /^((\/|!)(д|d) )?(wi|wiki|((что|кто) (так(ое|ой|ая|ие)|значит)|(what|who) is)) ([^\s]){1,}/ig, 100, () => this.getShortExplore(ctx) ],
            [ /^(\/|!)?((d|д) )?(кто|who|кого|кому) ([^\s]){1,}/ig, 100, async () => {
                if (!isGroupChat) return onlyGroupAvailable(ctx);

                const content = text.replace(/^(\/|!)?((d|д) )?(кто|who|кого|кому)/ig, "").trim();
                const members = await Bot.execute("messages.getConversationMembers", { peer_id });

                if (!members || !members.profiles) return internalError(ctx);
                if (members.profiles.length < 2) return ctx.reply(randomElement([
                    "Ты один в беседе, умник 😂", "В беседе кроме тебя никого, гений блять"
                ]));

                const target = randomElement(members.profiles);
                return ctx.reply(
                    `[id${target.id}|${target.first_name}] ${content}`
                );
            }],
            
            [ /js|types|java|(д)?(ж|я)ава|python|п(и|е)тон|php|node|ж(э|е){1,}с$|c(\+|#)|php|htm|css/ig, 100, () => {
                return ctx.reply(randomElement([
                    "Бот на КуМире", "robot.move 5",
                    "program bot;\nvar i: integer\nbegin\n\n i := 0;\nif (i < 1) then writeln('ArsenyJS еблан');\n\nend.",
                    `Как написать бота на html?\nРезультатов: примерно ${randomInt(120, 366)} 000 (0,${randomInt(35, 99)} сек.)`,
                    "Ходят слухи, что меня написали в блокноте"
                ]));
            }],
            [ /(youtu(\.)?be(.com)?)|ютуб/ig, 75, () => {
                if (/\/shorts/.test(text)) return ctx.reply(randomElement([
                    "Фу блять выключи", "Тебе норм такую хуйню скидывать?",
                    "Это чо за гибрид с ТикТоком", "Даже не проси меня это смотреть",
                    "Опять школота пляшет", "Пусть идёт уроки делает"
                ]));

                return ctx.reply(randomElement([
                    "Спасибо, что не TikTok", "Я смотрел, там еблан кричит чото",
                    "Это про чо", "Норм видос", "Опять пошлятина", "Иди нахуй, я не буду смотреть",
                    `На ${randomInt(2, 8)}-й секунде на меня похож!`, "Я такое не смотрю",
                    "Уроки программирования с ютуба блять снова", "Скажи этому школьнику, чтобы купил микрофон, я нихуя не понял",
                    "АААА ВЫКЛЮЧИ НАХУЙ!!!", "Я не понял прикола тут", "Объясните мне пж"
                ]));
            }],
            [ /(vm\.)?tiktok\.com|тикток/ig, 85, () => {
                if (/(vm\.)?tiktok\.com/ig.test(text)) return ctx.reply(randomElement([
                    "Опять кринжатина", "Данечка Милохин!",
                    "Я так сразу и не узнал", "Очередная школота хуйню снимает",
                    "Я даже пытаться посмотреть это не буду", "У меня не открывается",
                    "Да Господи, удали ты это", "Даже не проси это смотреть",
                    "Видеть не хочу, что там.", "Можешь больше не пытаться это присылать"
                ]));

                return ctx.reply(randomElement([
                    "От одного упоминания тошнит", "Из памяти у меня только 16гб оперативной, поэтому я хочу это забыть",
                    "Я бы удалил", "Удалите нахуй тикток"
                ]));
            }],

            [ /^(д(а){1,}|d(a){1,}|l(f){1,})$/ig, 17, () => ctx.reply(randomElement([ "Пизда", "Пизда АХХАХАХА", "Провода блять" ])) ],
            [ /^(н(е){1,}т|y(t){1,}n|n(e){1,}t)$/ig, 12, () => ctx.reply(randomElement([ "Минет", "Пидора ответ >=(", "В караганде" ])) ],
            [ /америк|сша|байден|обам|трамп/ig, 25, () => ctx.reply(randomElement([ "Я русский", "Меня еще не запретили блять" ])) ],

            [ null, 5, async () => {
                if (!senderProfile) return;

                const appealWord = randomElement([ senderName, senderSurname]);
                const catalog = await DataBase.getWords();
                const sentance = Sentence.buildSentence(catalog, {
                    beginPreset: appealWord,
                    customWordParser: word => customFormParser(word, [ "ЕД", "ИМ" ]),
                    orderPreset: randomElement([ 
                        [ 1 ], [ 2 ],
                        [ 0, 1 ], [ 1, 1 ], [ 2, 1 ]
                    ])
                });

                return ctx.reply(sentance);
            }],
            [ null, 5, () => ctx.reply(Static.Default()) ]
        ];

        Available.map(([ regex, chance, handler ]) => {
            return useAvailable(regex, chance, handler);
        });

        if (isHookTriggered) return;

        const randomFn = randomElement(voidHandlers);
        if (
            randomFn.answerChance 
            && isGroupChat
            && !chance(randomFn.answerChance)
        ) return next();

        return randomFn.callback();
    }
}

export default Syntax;

export const customFormParser = (word, grammems) => {
    let prevent = morphy.castFormByGramInfo(word, null, grammems, true);
    prevent = prevent && prevent[0];

    return (prevent || word).toLowerCase();
}