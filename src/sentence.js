/**************************************************\
************* Sentence Builder Algorithm ***********
\**************************************************/
import { morphy } from "./syntax.js";

import { randomElementExtended } from "./neural.js";

// utils
export const randomInt = (min, max) => Math.floor(Math.random() * (max - min) + min);
export const randomElement = (array) => array[randomInt(0, array.length)];
export const shuffleArray = (arr) =>  arr.sort(() => Math.round(Math.random() * 100) - 50);
export const chance = (percent) => {
    let random = randomInt(0, 101);

    return random <= percent;
}

export const upperFirst = (str) => `${str[0].toUpperCase()}${str.slice(1)}`;
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

const sizeUnits = [ "B", "KB", "MB", "GB", "TB", "PB", "Insane" ];
export const fileSize = (bytes) => {
    const number = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / 1024 ** Math.floor(number)).toFixed(1)} ${sizeUnits[number]}`;
};


const isValidForBuildWord = (word) => /^[а-яё-]{1,}$/ig.test(word);
const universalFinder = (obj, findPart, recursiveFn) => {
    const needPart = findPart.length > 1 ? findPart[0] : randomElement(findPart);

    const shuffled = shuffleArray(obj[needPart]);
    const randomWord = randomElement(shuffled);

    if (!isValidForBuildWord(randomWord)) return recursiveFn(obj);

    var part = morphy.getPartOfSpeech(randomWord);

    if (!part || !part.length || part[0] != needPart) return recursiveFn(obj);
    return randomWord;
}

const getSortedGramm = (gramm) => {
    const wordCase = gramm.filter(item => /им|рд|дт|вн|тв|дт/ig.test(item))[0] || "ИМ";
    const wordGenus = gramm.filter(item => /мр|жр/ig.test(item))[0] || "МР";
    const wordCount = gramm.filter(item => /ед|мн/ig.test(item))[0] || "ЕД";

    return [
        wordCase, wordGenus, wordCount
    ];
}

// Advanced
const Sentence = {
    buildVerb(obj) {
        return universalFinder(obj, [ "Г", "ИНФИНИТИВ" ], Sentence.buildVerb);
    },
    buildNoun(obj) {
        return universalFinder(obj, [ "С" ], Sentence.buildNoun);
    },
    buildAdjective(obj) {
        return universalFinder(obj, [ "П" ], Sentence.buildAdjective);
    },
    buildPreposition(obj) {
        return universalFinder(obj, [ "ПРЕДЛ" ], Sentence.buildPreposition);
    },
    buildPronoun(obj) {
        return universalFinder(obj, [ "МС" ], Sentence.buildPreposition);
    },

    buildSentence(array, options = {}) {
        const { 
            beginPreset, 
            lengthPreset, 
            orderPreset,
            customWordParser
        } = options;

        const isQuestion = chance(30);
        const sentenceLength = lengthPreset || 2; // randomInt(2, 5);

        var RenderText = [];
        var orderIds = [];
        const methodById = {
            0: Sentence.buildVerb,
            1: Sentence.buildNoun,
            2: Sentence.buildAdjective,
            3: Sentence.buildPreposition,
            4: Sentence.buildPronoun
        }

        // v2 declare order positions
        if (!orderPreset) {
            for (let i = 0; i < sentenceLength; i++) {
                switch (i) {
                    // define noun/pronoun
                    case 0:
                        let pronounChance = chance(28);
    
                        orderIds.push(pronounChance ? 1/*4*/ : 1);
                        break;
                    // define action or attribute of an object
                    case 1:
                        let adjectiveChance = sentenceLength < 3 && chance(25);
                        let currentId = adjectiveChance ? 2 : 0;
                        let unshiftId = (sentenceLength > 2 || currentId == 2) && chance(35);

                        orderIds[unshiftId ? "unshift" : "push"](currentId);
                        break;
                    default: 
                }
            }
        } else orderIds = orderPreset;

        // render orders to words
        RenderText = orderIds.map(id => {
            var nativeWord = methodById[id](array);

            if (customWordParser) return customWordParser(nativeWord);

            return nativeWord;
        });

        // identify morphological components
        var objectProps = [];
        const identifyMorph = () => {
            let findNoun = orderIds.indexOf(1);
            let findPronoun = orderIds.indexOf(4);
            let def = [ "ИМ", "МР", "ЕД" ];

            let characterId = Math.max(findNoun, findPronoun);
            if (characterId < 0) return def;

            var morph = morphy.getGramInfo(RenderText[characterId]);
            if (!morph || !morph[0][0]) return def;

            return getSortedGramm(
                morph[0][0].grammems
            );
        }

        objectProps = identifyMorph();

        // cast word forms
        if (!customWordParser) {
            RenderText = RenderText.map(word => {
                let prevent = morphy.castFormByGramInfo(word, null, objectProps, true);
                prevent = prevent && prevent[0];

                return (prevent || word).toLowerCase();
            });
        }

        if (beginPreset) RenderText.unshift(beginPreset);

        return upperFirst(`${RenderText.join(" ")}${isQuestion ? "?" : ""}`);
    },

    buildRandom(ctx) {
        const sentenceLength = randomInt(1, 3);
        const bitmap = {
            vowel: "ауоыэяюёие",
            consonant: "бвгджзёклмнпрстфхцчшщ"
        }

        var rendered = "";
        const builder = (template, exclude = false) => {
            let range = Object.keys(bitmap);
            if (exclude) {
                range = randomElementExtended(
                    range, range.indexOf(exclude)
                );
            } else range = randomElement(range);

            let char = randomElement(
                bitmap[range].split("")
            );

            var previus = (template + char).slice(-3);

            if (new RegExp(`^(${char}){3}$`, "i").test(previus)) return builder(template, range); // remove 3 in a row

            return template + char;
        }

        for (var i = 0; i < sentenceLength; i++) {
            let wordLength = randomInt(3, 13);
            let currentTemplate = "";

            for (var k = 0; k < wordLength; k++) currentTemplate = builder(currentTemplate);

            rendered += ` ${currentTemplate}`;
        }

        return ctx.reply(
            rendered.trim()
        );
    }
}

export default Sentence;